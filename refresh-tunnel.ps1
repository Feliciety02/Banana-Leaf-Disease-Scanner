<#
.DESCRIPTION
DahonMD one-command automation: brings the whole connected stack up.

Behavior (idempotent):
  1. Ensures the Laravel backend is running on 127.0.0.1:8001 (verified via /api/health)
  2. Ensures the web demo (Vite) is running on http://127.0.0.1:4173
  3. Reads the URL currently baked into mobile-frontend\.env
  4. If that URL still answers /api/health and a cloudflared process is alive ->
     keeps the existing tunnel; otherwise starts a fresh quick tunnel and
     updates .env.
  5. Decides whether the release APK must be rebuilt by comparing a content
     fingerprint of the mobile build inputs (src, assets, native module source,
     app.json, package files, .env) against the last successful build recorded
     in .dahonmd\mobile-build-state.json. It rebuilds ONLY when those inputs
     changed (or the APK/state is missing, or -ForceRebuild). Web, backend or
     script changes never trigger a rebuild.
  6. If an Android phone is connected, installs (updates) the APK on it when it
     was rebuilt (or always with -Install).

Usage:
  .\refresh-tunnel.ps1             # one command: backend + web + tunnel + on-demand APK rebuild
  .\refresh-tunnel.ps1 -NoWeb      # skip the web demo (backend/tunnel only)
  .\refresh-tunnel.ps1 -Restart    # force a brand-new tunnel even if healthy
  .\refresh-tunnel.ps1 -Install    # install the current APK on the phone even if nothing changed
  .\refresh-tunnel.ps1 -SkipInstall# never install on a phone
  .\refresh-tunnel.ps1 -SkipBuild  # update .env only, skip APK rebuild (state NOT updated)
  .\refresh-tunnel.ps1 -ForceRebuild# rebuild the APK even if nothing changed (state updated on success)
#>
[CmdletBinding()]
param(
  [switch]$Restart,
  [switch]$SkipBuild,
  [switch]$ForceRebuild,
  [switch]$Install,
  [switch]$SkipInstall,
  [switch]$StartWeb, # kept for backwards compatibility; the web demo now starts by default
  [switch]$NoWeb
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root 'mobile-frontend\.env'
$mobileDir = Join-Path $root 'mobile-frontend'
$androidDir = Join-Path $mobileDir 'android'
$apkPath = Join-Path $androidDir 'app\build\outputs\apk\release\app-release.apk'
$logDir = Join-Path $env:TEMP 'dahonmd-tunnel'
$errLog = Join-Path $logDir 'cloudflared.log'
$outLog = Join-Path $logDir 'cloudflared.out.log'
$stateDir = Join-Path $root '.dahonmd'
$statePath = Join-Path $stateDir 'mobile-build-state.json'
$fingerprintScheme = 1

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Test-Port([int]$port) {
  $c = New-Object Net.Sockets.TcpClient
  try { $c.Connect('127.0.0.1', $port); return $c.Connected }
  catch { return $false }
  finally { $c.Close() }
}

# True when a process runs on the port AND (optionally) its command line matches.
function Test-Service([int]$port, [string]$pattern) {
  if (-not (Test-Port $port)) { return $false }
  try {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { return $true }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
    if ($proc -and $pattern -and $proc.CommandLine -notmatch $pattern) {
      Write-Host "    Port $port is in use by an unexpected process (PID $($conn.OwningProcess)); leaving it as-is." -ForegroundColor Yellow
    }
    return $true
  } catch { return $true }
}

function Test-Http([string]$url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Test-Backend {
  return Test-Service 8001 'artisan.*serve'
}

function Start-Backend {
  Write-Step 'Starting Laravel backend on 127.0.0.1:8001'
  Start-Process -FilePath 'php' -ArgumentList 'artisan','serve','--host=127.0.0.1','--port=8001' `
    -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Backend) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-Backend)) { throw 'Backend did not come up on port 8001 within 30s.' }
  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-Http 'http://127.0.0.1:8001/api/health') -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (Test-Http 'http://127.0.0.1:8001/api/health') { Write-Host '    Backend is up (health OK).' -ForegroundColor Green }
  else { Write-Host '    Backend port is up but /api/health did not answer; check `php artisan serve`.' -ForegroundColor Yellow }
}

function Start-Web {
  if ($NoWeb) { Write-Host 'Skipping web frontend (-NoWeb).' -ForegroundColor Yellow; return }
  if (Test-Service 4173 'vite') {
    Write-Host 'Web frontend already running on http://127.0.0.1:4173' -ForegroundColor Green
    return
  }
  $webDir = Join-Path $root 'web-frontend'
  if (-not (Test-Path (Join-Path $webDir 'package.json'))) { Write-Host '    Web frontend not found; skipping.' -ForegroundColor Yellow; return }
  Write-Step 'Starting web frontend (Vite) on http://127.0.0.1:4173'
  $npmCmd = "$env:ProgramFiles\nodejs\npm.cmd"
  if (-not (Test-Path $npmCmd)) { $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source }
  if (-not $npmCmd) { $npmCmd = (Get-Command npm.ps1 -ErrorAction SilentlyContinue).Source }
  if ((Test-Path $npmCmd) -and $npmCmd.ToLower().EndsWith('.ps1')) {
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-Command', "& '$npmCmd' run dev" `
      -WorkingDirectory $webDir -WindowStyle Hidden | Out-Null
  } elseif ($npmCmd) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$npmCmd`" run dev" `
      -WorkingDirectory $webDir -WindowStyle Hidden | Out-Null
  } else {
    Write-Host "    npm not found; skip web frontend." -ForegroundColor Yellow
    return
  }
  $deadline = (Get-Date).AddSeconds(40)
  while (-not (Test-Service 4173 'vite') -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (Test-Service 4173 'vite') {
    $deadline = (Get-Date).AddSeconds(20)
    while (-not (Test-Http 'http://127.0.0.1:4173') -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (Test-Http 'http://127.0.0.1:4173') { Write-Host '    Web frontend is up.' -ForegroundColor Green }
    else { Write-Host "    Port is up but http://127.0.0.1:4173 did not answer; check 'npm run dev' in web-frontend." -ForegroundColor Red }
  } else { Write-Host "    Web frontend didn't come up in time; check 'npm run dev' in web-frontend." -ForegroundColor Red }
}

function Get-BakedUrl {
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^EXPO_PUBLIC_API_URL=' } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace '^EXPO_PUBLIC_API_URL=', '').Trim()
}

function Test-UrlHealthy([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url)) { return $false }
  $probe = $url.TrimEnd('/')
  if ($probe -match '/api$') { $probe += '/health' } else { $probe += '/api/health' }
  return Test-Http $probe
}

function Get-TunnelProc {
  try {
    return Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
      Where-Object { $_.CommandLine -match 'tunnel\s+--url' -and $_.CommandLine -match '8001' }
  } catch { return $null }
}

function Stop-OldTunnel {
  $procs = Get-TunnelProc
  if ($procs) {
    Write-Step 'Stopping old cloudflared tunnel(s)'
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
  }
}

function Start-Tunnel {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  Remove-Item -LiteralPath $errLog, $outLog -Force -ErrorAction SilentlyContinue
  Write-Step 'Starting cloudflared quick tunnel (HTTP/2) and waiting for its URL...'
  Start-Process -FilePath 'cloudflared' `
    -ArgumentList 'tunnel','--url','http://127.0.0.1:8001','--protocol','http2','--no-autoupdate' `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden | Out-Null

  $deadline = (Get-Date).AddSeconds(90)
  $url = $null
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $text = ''
    if (Test-Path $errLog) { $text += (Get-Content $errLog -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path $outLog) { $text += (Get-Content $outLog -Raw -ErrorAction SilentlyContinue) }
    $m = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $url = $m.Value; break }
    if ($text -match '(error|fail)') { Start-Sleep -Seconds 2 }
  }

  if (-not $url) {
    $tail = if (Test-Path $errLog) { (Get-Content $errLog -Tail 5 -ErrorAction SilentlyContinue) } else { '(no log)' }
    throw "cloudflared did not print a tunnel URL within 90s. Last log:`n$tail"
  }

  Write-Host "    Tunnel URL: $url" -ForegroundColor Green
  return $url
}

function Update-Env([string]$newUrl) {
  Write-Step "Updating $envFile"
  $base = ($newUrl.TrimEnd('/')) + '/api'
  $lines = @()
  if (Test-Path $envFile) { $lines = Get-Content $envFile }
  $out = @()
  $replaced = $false
  foreach ($l in $lines) {
    if ($l -match '^EXPO_PUBLIC_API_URL=') { $out += "EXPO_PUBLIC_API_URL=$base"; $replaced = $true }
    else { $out += $l }
  }
  if (-not $replaced) { $out += "EXPO_PUBLIC_API_URL=$base" }
  Set-Content -LiteralPath $envFile -Value $out -Encoding ASCII
  Write-Host "    EXPO_PUBLIC_API_URL=$base" -ForegroundColor Green
}

# Content SHA-256 over the mobile build inputs that determine the APK contents.
# Excludes generated/build dirs and node_modules (a dependency change is tracked
# via package-lock.json). web-frontend, backend, README and these scripts are
# deliberately not inputs.
function Get-MobileFingerprint {
  $names = @('.env','app.json','index.ts','package.json','package-lock.json')
  $files = New-Object System.Collections.Generic.List[string]
  foreach ($f in $names) {
    $p = Join-Path $mobileDir $f
    if (Test-Path -LiteralPath $p -PathType Leaf) { $files.Add($p) }
  }
  foreach ($d in @('src','assets','modules')) {
    $dir = Join-Path $mobileDir $d
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) { continue }
    Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
      $rel = $_.FullName.Substring($mobileDir.Length + 1)
      if ($rel -match '\\node_modules\\' -or $rel -match '(^|\\)build(\\|$)' -or $rel -match '(^|\\)\.gradle(\\|$)' -or $rel -match '(^|\\)\.kotlin(\\|$)') { return }
      $files.Add($_.FullName)
    }
  }
  $sb = New-Object System.Text.StringBuilder
  foreach ($p in ($files | Sort-Object)) {
    $rel = $p.Substring($mobileDir.Length + 1).Replace('\', '/')
    $h = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash
    [void]$sb.Append("$rel=$h`n")
  }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  return ([BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($sb.ToString())))).Replace('-', '').ToLowerInvariant()
}

function Get-MobileState {
  if (-not (Test-Path -LiteralPath $statePath)) { return $null }
  try {
    return (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json)
  } catch { return $null }
}

function Save-MobileState([string]$Fingerprint, [string]$ApiUrl, [string]$ApkPath) {
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
  $data = [ordered]@{
    scheme      = $fingerprintScheme
    fingerprint = $Fingerprint
    apiUrl      = $ApiUrl
    apkPath     = $ApkPath
    builtAt     = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
  }
  $data | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding ASCII
}

function Rebuild-Apk {
  if (-not (Test-Path (Join-Path $androidDir 'gradlew.bat'))) { throw 'gradlew.bat not found; aborting rebuild.' }
  Write-Step 'Rebuilding release APK (fresh JS bundle with current sources/URL)...'
  # NODE_ENV=production is what Expo CLI sets for a release build. Without it,
  # @expo/env prints a warning to stderr during :expo-constants:createExpoConfig,
  # and PowerShell 5.1 treats that stderr write as a terminating error under
  # $ErrorActionPreference='Stop', aborting assembleRelease mid-run.
  Push-Location $androidDir
  $prevNodeEnv = $env:NODE_ENV
  $env:NODE_ENV = 'production'
  try {
    & .\gradlew.bat :app:createBundleReleaseJsAndAssets --rerun-tasks
    if ($LASTEXITCODE -ne 0) { throw 'JS bundle step failed.' }
    & .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw 'assembleRelease failed.' }
  } finally {
    $env:NODE_ENV = $prevNodeEnv
    Pop-Location
  }
  if (-not (Test-Path -LiteralPath $apkPath)) { throw 'assembleRelease finished but the APK file is missing.' }
  Write-Host "    APK rebuilt: $apkPath" -ForegroundColor Green
}

function Get-AndroidDevice {
  if (-not (Get-Command adb -ErrorAction SilentlyContinue)) { return $null }
  $device = & adb devices 2>$null | Select-String -Pattern '^\S+\tdevice$' | Select-Object -First 1
  if (-not $device) { return $null }
  return ($device.ToString() -split "`t")[0].Trim()
}

function Install-Apk {
  if ($SkipInstall) { Write-Host '    Skipping phone install (-SkipInstall).' -ForegroundColor Yellow; return }
  if (-not (Test-Path -LiteralPath $apkPath)) { Write-Host '    No APK found to install.' -ForegroundColor Yellow; return }
  $serial = Get-AndroidDevice
  if (-not $serial) {
    Write-Host '    No Android phone detected (adb offline/none). Skipping install.' -ForegroundColor Yellow
    return
  }
  Write-Step "Installing APK on phone ($serial)..."
  & adb -s $serial install -r $apkPath 2>&1 | ForEach-Object { Write-Host "    $_" }
  if ($LASTEXITCODE -eq 0) { Write-Host '    Phone updated.' -ForegroundColor Green }
  else { Write-Host '    Install failed (check `Allow unknown sources` / storage on the phone).' -ForegroundColor Red }
}

# ---------- main ----------
Write-Host '=== DahonMD startup ==='

$baked = Get-BakedUrl
Write-Host "Baked URL: $(if ($baked) { $baked } else { '(none)' })"

if (-not (Test-Backend)) { Start-Backend } else { Write-Host 'Backend already running on port 8001.' -ForegroundColor Green }
Start-Web

$healthy = Test-UrlHealthy $baked
$tunnelAlive = [bool](Get-TunnelProc)
$newUrl = $null

if ($Restart) {
  if ($healthy -and $tunnelAlive) { Write-Host "`n==> Force-restarting tunnel (-Restart)." -ForegroundColor Yellow }
  Stop-OldTunnel
  $newUrl = Start-Tunnel
} elseif (-not $healthy -or -not $tunnelAlive) {
  if ($healthy -and -not $tunnelAlive) {
    Write-Host "`nNote: baked URL resolves but no cloudflared process is running locally." -ForegroundColor Yellow
  }
  Stop-OldTunnel
  $newUrl = Start-Tunnel
} else {
  Write-Host "`nTunnel is healthy and running: $baked" -ForegroundColor Green
}

$effectiveApiUrl = $baked
if ($newUrl) {
  $newUrl = $newUrl.Replace(' https://', 'https://')
  $effectiveApiUrl = $newUrl.TrimEnd('/') + '/api'
  if ($effectiveApiUrl -ne $baked) { Update-Env $newUrl } else { Write-Host 'Same URL as before; leaving .env untouched.' }
}

$fingerprint = Get-MobileFingerprint
$state = Get-MobileState
$apkExists = Test-Path -LiteralPath $apkPath
$reason = $null

if ($SkipBuild) {
  Write-Host "`nSkipping APK rebuild (-SkipBuild). Build state is NOT updated; the next run will detect and rebuild." -ForegroundColor Yellow
} elseif ($ForceRebuild) { $reason = 'forced (-ForceRebuild)' }
elseif (-not $state) { $reason = 'no recorded build state yet' }
elseif ($state.scheme -ne $fingerprintScheme) { $reason = 'build state is from an older format' }
elseif (-not $apkExists) { $reason = 'APK file is missing' }
elseif ($fingerprint -ne $state.fingerprint) { $reason = 'mobile build inputs changed' }

$rebuilt = $false
if ($reason) {
  Write-Host "`n==> Mobile change detected ($reason); rebuilding release APK..."
  try {
    Rebuild-Apk
    Save-MobileState -Fingerprint $fingerprint -ApiUrl $effectiveApiUrl -ApkPath $apkPath
    Write-Host '    Build state recorded.' -ForegroundColor Green
    $rebuilt = $true
  } catch {
    Write-Host "APK build FAILED: $_" -ForegroundColor Red
    Write-Host '    Keeping the previous APK and recorded build state untouched. Fix the build, then re-run.' -ForegroundColor Yellow
  }
} else {
  Write-Host "`nMobile app is current (fingerprint matches the last successful build); reusing existing APK." -ForegroundColor Green
}

if ($rebuilt -or $Install) { Install-Apk }

$phoneLine = 'not detected'
$serial = Get-AndroidDevice
if ($serial) { $phoneLine = "$serial (APK installed if requested above)" }

Write-Host "`n=== DONE ===" -ForegroundColor Cyan
Write-Host "Backend:      http://127.0.0.1:8001 (health OK)" -ForegroundColor Cyan
Write-Host "Web demo:     http://127.0.0.1:4173" -ForegroundColor Cyan
Write-Host "Mobile URL:   $(if ($effectiveApiUrl) { $effectiveApiUrl } else { '(not set)' })" -ForegroundColor Cyan
Write-Host "Mobile app:   $(if ($rebuilt) { 'rebuilt this run' } elseif ($reason) { 'build FAILED (previous APK kept)' } else { 'current (no rebuild)' })" -ForegroundColor Cyan
Write-Host "APK:          $(if (Test-Path -LiteralPath $apkPath) { $apkPath } else { '(not built)' })" -ForegroundColor Cyan
Write-Host "Phone:        $phoneLine" -ForegroundColor Cyan
Write-Host "`nTip: keep this tunnel running so the URL stays valid." -ForegroundColor Cyan