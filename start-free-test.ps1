<#
.SYNOPSIS
Starts DahonMD for a USB phone, or opens a temporary HTTPS test link.

.DESCRIPTION
Builds the website and an isolated Laravel backend. A USB-debugging phone uses
an ADB reverse connection automatically. Without a phone, a Cloudflare Quick
Tunnel provides a temporary HTTPS link and QR code. Use -Cloudflare to request
a public link even when a USB phone is connected.

.EXAMPLE
.\start-free-test.ps1

.EXAMPLE
.\start-free-test.ps1 -NoOpen   # do not open the browser or the QR code
#>
[CmdletBinding()]
param(
    [switch]$SkipPhone,
    [switch]$ForceApkBuild,
    [switch]$NoOpen,
    [switch]$UsbOnly,
    [switch]$Cloudflare,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $root '.dahonmd\free-test'
$testBackend = Join-Path $stateDir 'backend'
$stateFile = Join-Path $stateDir 'state.json'
$webDir = Join-Path $root 'web-frontend'
$mobileDir = Join-Path $root 'mobile-frontend'
$buildMobileDir = 'C:\dmd\mobile'
$androidDir = Join-Path $buildMobileDir 'android'
$apk = Join-Path $androidDir 'app\build\outputs\apk\release\app-release.apk'
$savedApk = Join-Path $mobileDir 'builds\DahonMD-free-test.apk'
$backendPort = 8002
$webPort = 4174

function Find-Tool([string]$name, [string]$fallback) {
    $found = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.Source }
    if (Test-Path -LiteralPath $fallback -PathType Leaf) { return $fallback }
    throw "$name is required. Install it or add it to PATH."
}

function Wait-Http([string]$url, [int]$seconds = 30) {
    $deadline = (Get-Date).AddSeconds($seconds)
    $lastError = ''
    while ((Get-Date) -lt $deadline) {
        try {
            if ($url -like 'https://*.trycloudflare.com*') {
                $body = & curl.exe --fail --silent --show-error --max-time 8 $url 2>$null
                if ($LASTEXITCODE -eq 0) { return [pscustomobject]@{ StatusCode = 200; Content = ($body -join "`n") } }
                $lastError = "curl exit $LASTEXITCODE"
                Start-Sleep -Milliseconds 700
                continue
            }
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return $response }
            $lastError = "HTTP $($response.StatusCode)"
        } catch { $lastError = $_.Exception.Message }
        Start-Sleep -Milliseconds 700
    }
    throw "Did not get a healthy response from $url within $seconds seconds. Last error: $lastError"
}

function Assert-FreePort([int]$port) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { throw "Port $port is already used by process $($listener.OwningProcess). Close that service, then run this script again." }
}

function Stop-OurProcess($pidValue, [string]$marker) {
    if (-not $pidValue) { return }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -and $process.CommandLine.Contains($marker)) {
        Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
    }
}

function Copy-Tree([string]$source, [string]$destination, [string[]]$extra = @()) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    & robocopy $source $destination /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP @extra | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Could not copy $source to $destination (robocopy code $LASTEXITCODE)." }
}

function Get-MobileFingerprint {
    $files = @()
    foreach ($name in @('app.json', 'index.ts', 'package.json', 'package-lock.json')) {
        $path = Join-Path $mobileDir $name
        if (Test-Path -LiteralPath $path -PathType Leaf) { $files += $path }
    }
    foreach ($name in @('src', 'assets', 'modules')) {
        $path = Join-Path $mobileDir $name
        if (Test-Path -LiteralPath $path -PathType Container) {
            $files += Get-ChildItem -LiteralPath $path -Recurse -File | Where-Object { $_.FullName -notmatch '\\(build|node_modules|\.gradle|\.kotlin)\\' } | Select-Object -ExpandProperty FullName
        }
    }
    $lines = foreach ($path in ($files | Sort-Object)) {
        "$($path.Substring($mobileDir.Length + 1).Replace('\', '/'))=$((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash)"
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Get-PhoneSerial([string]$adb) {
    $line = & $adb devices | Where-Object { $_ -match '^\S+\s+device$' } | Select-Object -First 1
    if ($line) { return ($line -split '\s+')[0] }
    return $null
}

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$php = Find-Tool 'php.exe' (Join-Path $env:LOCALAPPDATA 'dev-tools\php\php.exe')
$node = Find-Tool 'node.exe' (Join-Path $env:LOCALAPPDATA 'dev-tools\node-v24.19.0-win-x64\node.exe')
$npm = Find-Tool 'npm.cmd' (Join-Path $env:LOCALAPPDATA 'dev-tools\node-v24.19.0-win-x64\npm.cmd')
$cloudflared = Find-Tool 'cloudflared.exe' (Join-Path $env:LOCALAPPDATA 'dev-tools\cloudflared.exe')
$adb = Find-Tool 'adb.exe' (Join-Path $env:LOCALAPPDATA 'dev-tools\platform-tools\adb.exe')
if ($UsbOnly -and $SkipPhone) { throw 'Use -UsbOnly without -SkipPhone.' }
if ($UsbOnly -and $Cloudflare) { throw 'Choose either -UsbOnly or -Cloudflare.' }
$connectedSerial = Get-PhoneSerial $adb
if ($UsbOnly -and -not $connectedSerial) { throw 'USB phone not detected. Unlock the phone, allow USB debugging, then check adb devices.' }
$useUsb = -not $Stop -and ($UsbOnly -or (-not $Cloudflare -and -not $SkipPhone -and $connectedSerial))
if ($useUsb -and -not $UsbOnly) { Write-Host "USB phone $connectedSerial detected; using the direct USB connection." -ForegroundColor Cyan }
$env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
$vite = Join-Path $webDir 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vite) -and (Test-Path -LiteralPath 'C:\dmd\web\node_modules\vite\bin\vite.js')) {
    Copy-Tree $webDir 'C:\dmd\web' @('/XD', 'node_modules', 'dist', '.vite', '/XF', '.env')
    $webDir = 'C:\dmd\web'
    $vite = Join-Path $webDir 'node_modules\vite\bin\vite.js'
}
if (-not (Test-Path -LiteralPath $vite)) { throw 'Run npm install in web-frontend first.' }

$previous = $null
if (Test-Path -LiteralPath $stateFile) {
    try { $previous = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } catch { }
}
$appKey = if ($previous -and $previous.appKey) { $previous.appKey } else {
    $random = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($random) } finally { $rng.Dispose() }
    'base64:' + [Convert]::ToBase64String($random)
}
$lastFingerprint = if ($previous) { $previous.mobileFingerprint } else { $null }

# Stop only services this script started. Other local backend/web sessions stay untouched.
Stop-OurProcess $previous.tunnelPid "127.0.0.1:$webPort"
Stop-OurProcess $previous.webPid "--port $webPort"
Stop-OurProcess $previous.backendPid "127.0.0.1:$backendPort"
if ($previous.url -eq "http://127.0.0.1:$webPort") {
    $oldSerial = Get-PhoneSerial $adb
    # The old USB forward may already be gone (phone unplugged); that must not stop the launch.
    if ($oldSerial) { try { & $adb -s $oldSerial reverse --remove "tcp:$webPort" 2>$null | Out-Null } catch { } }
}
# An old URL and QR code are invalid once their tunnel is stopped. Preserve
# the app key and APK fingerprint, but never leave a stale active-link record.
Remove-Item -LiteralPath (Join-Path $stateDir 'tunnel-url.txt'), (Join-Path $stateDir 'connect-phone.png') -Force -ErrorAction SilentlyContinue
[ordered]@{
    appKey = $appKey; url = $null; tunnelPid = $null; backendPid = $null
    webPid = $null; mobileFingerprint = $lastFingerprint; updatedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
if ($Stop) {
    Write-Host 'Stopped the DahonMD free test website, backend, and tunnel.' -ForegroundColor Green
    return
}
Start-Sleep -Milliseconds 800
Assert-FreePort $backendPort
Assert-FreePort $webPort

if ($useUsb) { Write-Host 'Starting the local USB phone server...' -ForegroundColor Cyan }
else { Write-Host 'Starting a fresh free Cloudflare test link...' -ForegroundColor Cyan }
$tunnelRunId = (Get-Date).ToString('yyyyMMdd-HHmmss')
$tunnel = $null
$backend = $null
$web = $null
try {
    $url = $null
    $tunnelProtocols = @('http2', 'quic', 'http2')
    if ($useUsb) { $url = "http://127.0.0.1:$webPort" }
    for ($attempt = 1; -not $useUsb -and $attempt -le $tunnelProtocols.Count -and -not $url; $attempt++) {
        $protocol = $tunnelProtocols[$attempt - 1]
        $tunnelOut = Join-Path $stateDir "tunnel-$tunnelRunId-attempt-$attempt.out.log"
        $tunnelErr = Join-Path $stateDir "tunnel-$tunnelRunId-attempt-$attempt.err.log"
        Write-Host "Requesting test link (attempt $attempt of $($tunnelProtocols.Count), $protocol)..." -ForegroundColor Cyan
        $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$webPort", '--protocol', $protocol, '--no-autoupdate') -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr
        $deadline = (Get-Date).AddSeconds(50)
        while ((Get-Date) -lt $deadline) {
            $log = ''
            if (Test-Path -LiteralPath $tunnelErr) { $log += Get-Content -LiteralPath $tunnelErr -Raw -ErrorAction SilentlyContinue }
            if (Test-Path -LiteralPath $tunnelOut) { $log += Get-Content -LiteralPath $tunnelOut -Raw -ErrorAction SilentlyContinue }
            # cloudflared error messages can mention api.trycloudflare.com. That is
            # Cloudflare's control API, not the public quick-tunnel hostname.
            $match = [regex]::Match($log, 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com')
            # A hostname alone does not mean the phone can reach it. Wait until
            # cloudflared confirms it has registered a connection to the edge.
            if ($match.Success -and $log -match 'Registered tunnel connection') { $url = $match.Value; break }
            if ($tunnel.HasExited) { break }
            Start-Sleep -Seconds 1
        }
        if ($url) { break }
        if (-not $tunnel.HasExited) {
            Stop-OurProcess $tunnel.Id "127.0.0.1:$webPort"
            Wait-Process -Id $tunnel.Id -Timeout 5 -ErrorAction SilentlyContinue
        }
        Write-Warning "Cloudflare did not establish a working tunnel on attempt $attempt. See $tunnelErr"
        $tunnel = $null
        if ($attempt -lt $tunnelProtocols.Count) { Start-Sleep -Seconds (2 * $attempt) }
    }
    if (-not $url) { throw "Cloudflare could not establish a tunnel after $($tunnelProtocols.Count) attempts. Check $tunnelErr and your network's access to Cloudflare, then rerun this command." }
    $hostName = ([uri]$url).Host
    if ($useUsb) { Write-Host "USB phone server: $url" -ForegroundColor Green }
    else { Write-Host "Shared website and phone URL: $url" -ForegroundColor Green }

    Write-Host 'Preparing the isolated test database...' -ForegroundColor Cyan
    foreach ($directory in @('app', 'bootstrap', 'config', 'public', 'resources', 'routes')) {
        Copy-Tree (Join-Path $root "backend\$directory") (Join-Path $testBackend $directory)
    }
    Copy-Tree (Join-Path $root 'backend\database') (Join-Path $testBackend 'database') @('/XF', '*.sqlite', '*.db')
    if (-not (Test-Path -LiteralPath (Join-Path $testBackend 'vendor\autoload.php'))) {
        $vendorSource = Join-Path $root 'backend\vendor'
        if (-not (Test-Path -LiteralPath (Join-Path $vendorSource 'autoload.php'))) { $vendorSource = 'C:\dmd\backend\vendor' }
        if (-not (Test-Path -LiteralPath (Join-Path $vendorSource 'autoload.php'))) { throw 'Laravel vendor/ is missing. Run composer install in backend first.' }
        Copy-Tree $vendorSource (Join-Path $testBackend 'vendor')
    }
    Copy-Item -LiteralPath (Join-Path $root 'backend\artisan') -Destination (Join-Path $testBackend 'artisan') -Force
    Copy-Item -LiteralPath (Join-Path $root 'backend\composer.json') -Destination (Join-Path $testBackend 'composer.json') -Force
    foreach ($directory in @('bootstrap\cache', 'storage\app\private', 'storage\framework\cache\data', 'storage\framework\views', 'storage\logs')) {
        New-Item -ItemType Directory -Path (Join-Path $testBackend $directory) -Force | Out-Null
    }
    $database = Join-Path $testBackend 'database\database.sqlite'
    if (-not (Test-Path -LiteralPath $database)) { New-Item -ItemType File -Path $database | Out-Null }
    $databaseForEnv = $database.Replace('\', '/')
    $settings = @(
        'APP_NAME=DahonMD', 'APP_ENV=production', "APP_KEY=$appKey", 'APP_DEBUG=false', "APP_URL=$url",
        'DB_CONNECTION=sqlite', "DB_DATABASE=$databaseForEnv", 'SESSION_DRIVER=database', 'SESSION_ENCRYPT=true',
        'SESSION_SECURE_COOKIE=true', 'SESSION_SAME_SITE=lax', 'SESSION_DOMAIN=null',
        'CACHE_STORE=database', 'QUEUE_CONNECTION=database', 'FILESYSTEM_DISK=local',
        'MAIL_MAILER=log', 'LOG_CHANNEL=single', 'LOG_LEVEL=warning', 'GROQ_API_KEY=',
        # Mail only goes to the log here, so new test sign-ups could never verify.
        'REQUIRE_VERIFIED_EMAIL=false',
        "SANCTUM_STATEFUL_DOMAINS=$hostName,127.0.0.1:$webPort", "WEB_FRONTEND_ORIGINS=$url"
    )
    [IO.File]::WriteAllLines((Join-Path $testBackend '.env'), [string[]]$settings, [Text.UTF8Encoding]::new($false))
    Push-Location $testBackend
    try {
        & $php artisan migrate --force --no-interaction
        if ($LASTEXITCODE -ne 0) { throw 'The test database migration failed.' }
        $oldSeedEnv = $env:APP_ENV
        $env:APP_ENV = 'testing'
        try {
            & $php artisan db:seed --class=DemoLoginSeeder --force --no-interaction
            if ($LASTEXITCODE -ne 0) { throw 'Test profile setup failed.' }
            # Seed the source-audited disease knowledge only once, so later launches
            # keep whatever reviewers changed in this test database.
            $sourceCount = & $php -r '$db = new PDO(''sqlite:'' . $argv[1]); echo $db->query(''SELECT COUNT(*) FROM research_sources'')->fetchColumn();' $database
            if ($LASTEXITCODE -ne 0) { throw 'Could not read the test knowledge base.' }
            if ([int]$sourceCount -eq 0) {
                & $php artisan db:seed --class=ScientificKnowledgeSeeder --force --no-interaction
                if ($LASTEXITCODE -ne 0) { throw 'Disease knowledge setup failed.' }
            }
        } finally { $env:APP_ENV = $oldSeedEnv }
    } finally { Pop-Location }

    $ca = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\Lib\site-packages\certifi\cacert.pem'
    if (-not (Test-Path -LiteralPath $ca)) {
        $ca = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\Lib\site-packages\pip\_vendor\certifi\cacert.pem'
    }
    if (-not (Test-Path -LiteralPath $ca)) { throw 'A CA certificate bundle is required for the password safety check. Install Python certifi or configure PHP curl.cainfo.' }
    $router = Join-Path $testBackend 'vendor\laravel\framework\src\Illuminate\Foundation\resources\server.php'
    # The API accepts leaf photos up to 10 MB; PHP's default upload limit is 2 MB.
    $backend = Start-Process -FilePath $php -ArgumentList @('-d', "curl.cainfo=$ca", '-d', "openssl.cafile=$ca", '-d', 'upload_max_filesize=10M', '-d', 'post_max_size=12M', '-S', "127.0.0.1:$backendPort", $router) -WorkingDirectory (Join-Path $testBackend 'public') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'backend.out.log') -RedirectStandardError (Join-Path $stateDir 'backend.err.log')
    Wait-Http "http://127.0.0.1:$backendPort/api/health" | Out-Null

    Write-Host 'Building the website...' -ForegroundColor Cyan
    $oldWebProfiles = $env:VITE_TEST_PROFILES
    $env:VITE_TEST_PROFILES = 'true'
    $oldWebApi = $env:VITE_WEB_API_URL
    $env:VITE_WEB_API_URL = '/api'
    Push-Location $webDir
    try {
        & $npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Website build failed.' }
    } finally {
        Pop-Location
        $env:VITE_WEB_API_URL = $oldWebApi
        $env:VITE_TEST_PROFILES = $oldWebProfiles
    }
    $oldProxy = $env:DAHONMD_TEST_API_TARGET
    $oldHost = $env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS
    $env:DAHONMD_TEST_API_TARGET = "http://127.0.0.1:$backendPort"
    $env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = $hostName
    try {
        $web = Start-Process -FilePath $node -ArgumentList @($vite, 'preview', '--host', '127.0.0.1', '--port', "$webPort", '--strictPort') -WorkingDirectory $webDir -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'web.out.log') -RedirectStandardError (Join-Path $stateDir 'web.err.log')
    } finally {
        $env:DAHONMD_TEST_API_TARGET = $oldProxy
        $env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = $oldHost
    }
    Wait-Http "http://127.0.0.1:$webPort/api/health" 20 | Out-Null
    Wait-Http "$url/api/health" 90 | Out-Null
    $page = Wait-Http $url 20
    if ($page.Content -notmatch '<html') { throw 'The public website did not return HTML.' }

    # Hand the new address to the website and phone without any typing: save and
    # copy it, open the website, and make a QR code the phone camera can scan.
    Set-Content -LiteralPath (Join-Path $stateDir 'tunnel-url.txt') -Value $url -Encoding UTF8
    try { Set-Clipboard -Value $url } catch { }
    $qrPath = $null
    if (-not $useUsb) {
        $qrPath = Join-Path $stateDir 'connect-phone.png'
        $qrModules = Join-Path $mobileDir 'node_modules'
        if (-not (Test-Path -LiteralPath (Join-Path $qrModules 'toqr'))) { $qrModules = Join-Path $buildMobileDir 'node_modules' }
        & $node (Join-Path $root 'scripts\connect-qr.cjs') "$url/connect.html" $qrPath $qrModules | Out-Null
        if ($LASTEXITCODE -ne 0) { $qrPath = $null; Write-Host 'Could not create the phone QR code; use the link below instead.' -ForegroundColor Yellow }
    }
    if (-not $NoOpen) { Start-Process $url }

    $fingerprint = (Get-MobileFingerprint) + $(if ($useUsb) { '-usb' } else { '-cloudflare' })
    $state = [ordered]@{ appKey = $appKey; url = $url; tunnelPid = $(if ($tunnel) { $tunnel.Id } else { $null }); backendPid = $backend.Id; webPid = $web.Id; mobileFingerprint = $lastFingerprint; updatedAt = (Get-Date).ToString('o') }
    $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

    if (-not $SkipPhone) {
        $serial = Get-PhoneSerial $adb
        if ($useUsb -and -not $serial) { throw 'USB phone disconnected during the build. Reconnect it, allow USB debugging, then rerun the command.' }
        if ($serial) {
            if ($ForceApkBuild -or -not (Test-Path -LiteralPath $apk) -or $fingerprint -ne $lastFingerprint) {
                Write-Host 'Building the Android APK (mobile code changed)...' -ForegroundColor Cyan
                if (-not (Test-Path -LiteralPath (Join-Path $buildMobileDir 'node_modules\expo\package.json'))) {
                    throw "The local Android build mirror at $buildMobileDir is missing dependencies. Restore it before building."
                }
                Copy-Tree $mobileDir $buildMobileDir @('/XD', 'node_modules', '.gradle', 'build', '.expo', '/XF', '.env')
                $oldMobileProfiles = $env:EXPO_PUBLIC_TEST_PROFILES
                $env:EXPO_PUBLIC_TEST_PROFILES = 'true'
                $oldUsbBridge = $env:EXPO_PUBLIC_TEST_USB_BRIDGE
                $env:EXPO_PUBLIC_TEST_USB_BRIDGE = if ($useUsb) { 'true' } else { 'false' }
                $oldNodeEnv = $env:NODE_ENV
                $oldApiUrl = $env:EXPO_PUBLIC_API_URL
                $oldJava = $env:JAVA_HOME
                $oldAndroidHome = $env:ANDROID_HOME
                $oldAndroidSdkRoot = $env:ANDROID_SDK_ROOT
                $env:NODE_ENV = 'production'
                $env:EXPO_PUBLIC_API_URL = ''
                if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $env:LOCALAPPDATA 'dev-tools\jdk-17.0.20.1+1' }
                if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
                if (-not $env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME }
                $manifestPath = Join-Path $androidDir 'app\src\main\AndroidManifest.xml'
                $manifestBackup = [IO.File]::ReadAllBytes($manifestPath)
                Push-Location $androidDir
                try {
                    if ($useUsb) {
                        # This temporary test APK uses cleartext only for the ADB
                        # loopback bridge. Restore the source manifest after build.
                        [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
                        $manifest.manifest.application.SetAttribute('usesCleartextTraffic', 'http://schemas.android.com/apk/res/android', 'true')
                        $manifest.Save($manifestPath)
                    }
                    & .\gradlew.bat :app:createBundleReleaseJsAndAssets --rerun-tasks
                    if ($LASTEXITCODE -ne 0) { throw 'Mobile JavaScript bundle failed.' }
                    & .\gradlew.bat assembleRelease
                    if ($LASTEXITCODE -ne 0) { throw 'Android APK build failed.' }
                } finally {
                    Pop-Location
                    [IO.File]::WriteAllBytes($manifestPath, $manifestBackup)
                    $env:NODE_ENV = $oldNodeEnv
                    $env:EXPO_PUBLIC_TEST_PROFILES = $oldMobileProfiles
                    $env:EXPO_PUBLIC_TEST_USB_BRIDGE = $oldUsbBridge
                    $env:EXPO_PUBLIC_API_URL = $oldApiUrl
                    $env:JAVA_HOME = $oldJava
                    $env:ANDROID_HOME = $oldAndroidHome
                    $env:ANDROID_SDK_ROOT = $oldAndroidSdkRoot
                }
                New-Item -ItemType Directory -Path (Split-Path -Parent $savedApk) -Force | Out-Null
                Copy-Item -LiteralPath $apk -Destination $savedApk -Force
                $state.mobileFingerprint = $fingerprint
                $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
            }
            Write-Host "Installing app on phone $serial..." -ForegroundColor Cyan
            & $adb -s $serial install -r $apk
            if ($LASTEXITCODE -ne 0) { throw 'Could not install the APK on the phone.' }
            if ($useUsb) {
                & $adb -s $serial reverse "tcp:$webPort" "tcp:$webPort"
                if ($LASTEXITCODE -ne 0) { throw 'Could not create the USB phone connection. Keep USB debugging enabled and retry.' }
            }
            $deepLink = 'dahonmd://server?url=' + [uri]::EscapeDataString($url)
            & $adb -s $serial shell am start -W -a android.intent.action.VIEW -d $deepLink -p com.dahonmd.field
            if ($LASTEXITCODE -ne 0) { throw 'Could not open the server link in the phone app.' }
            Write-Host 'Connection link opened on the phone. Confirm the "Server connected" message in the app.' -ForegroundColor Green
            Write-Host 'If the test address changed, sign in again on the phone.' -ForegroundColor Yellow
        } else {
            Write-Host 'No USB-debugging phone detected.' -ForegroundColor Yellow
            if ($qrPath) {
                Write-Host 'Scan the QR code with the phone camera and tap "Open DahonMD app" to connect it.' -ForegroundColor Yellow
                if (-not $NoOpen) { Start-Process $qrPath }
            }
            Write-Host "Or open $url/connect.html in the phone's browser." -ForegroundColor Yellow
        }
    }
    if ($useUsb) {
        Write-Host "USB phone server: $url" -ForegroundColor Green
        Write-Host 'Keep the phone connected by USB and the computer running while using connected features.'
    } else {
        Write-Host "Website and phone server: $url" -ForegroundColor Green
        Write-Host 'The computer must remain on for this temporary link to work.'
    }
} catch {
    if ($web) { Stop-OurProcess $web.Id "--port $webPort" }
    if ($backend) { Stop-OurProcess $backend.Id "127.0.0.1:$backendPort" }
    if ($tunnel) { Stop-OurProcess $tunnel.Id "127.0.0.1:$webPort" }
    Remove-Item -LiteralPath (Join-Path $stateDir 'tunnel-url.txt'), (Join-Path $stateDir 'connect-phone.png') -Force -ErrorAction SilentlyContinue
    $savedFingerprint = if ($state) { $state.mobileFingerprint } else { $lastFingerprint }
    [ordered]@{
        appKey = $appKey; url = $null; tunnelPid = $null; backendPid = $null
        webPid = $null; mobileFingerprint = $savedFingerprint; updatedAt = (Get-Date).ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    throw
}
