<#
.SYNOPSIS
Sends the active DahonMD HTTPS test link when an ADB phone appears.

.DESCRIPTION
This helper is started by start-free-test.ps1. It never builds or installs an
APK. It exits when the test link is stopped or replaced.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$StateFile,
    [Parameter(Mandatory = $true)][string]$AdbPath,
    [Parameter(Mandatory = $true)][string]$LogFile
)

$ErrorActionPreference = 'Stop'
$sent = @{}
$lastAvailability = ''
$lastUrl = ''

function Invoke-AdbWithTimeout([string[]]$arguments, [int]$timeoutSeconds = 20) {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $AdbPath
    $start.Arguments = $arguments -join ' '
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    try {
        if (-not $process.WaitForExit($timeoutSeconds * 1000)) {
            $process.Kill()
            $process.WaitForExit()
            return [pscustomobject]@{ ExitCode = -1; Output = 'ADB timed out.' }
        }
        $output = $process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd()
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $output }
    } finally {
        $process.Dispose()
    }
}

while ($true) {
    try {
        if (-not (Test-Path -LiteralPath $StateFile -PathType Leaf)) { break }
        $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
        if (-not $state.url -or $state.url -notmatch '^https://') { break }
        if ($state.phoneWatcherPid -and [int]$state.phoneWatcherPid -ne $PID) { break }
        if ($state.url -ne $lastUrl) {
            $lastUrl = $state.url
            $sent.Clear()
            Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) Watching HTTPS link $lastUrl"
        }

        $deviceList = Invoke-AdbWithTimeout -arguments @('devices', '-l')
        if ($deviceList.ExitCode -ne 0) { throw "ADB device check failed: $($deviceList.Output.Trim())" }
        $serials = @($deviceList.Output -split "`r?`n" | ForEach-Object {
            if ($_ -match '^(\S+)\s+device(?:\s|$)') { $matches[1] }
        })
        $availability = if ($serials.Count -eq 0) { 'absent' } else { 'present' }
        if ($availability -ne $lastAvailability) {
            $lastAvailability = $availability
            if ($availability -eq 'absent') {
                Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) Waiting for an authorized ADB phone. Open $($state.url)/connect.html on the phone if USB is unavailable."
            } else {
                Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) ADB phone detected; sending the link."
            }
        }
        foreach ($serial in @($sent.Keys)) {
            if ($serial -notin $serials) { $sent.Remove($serial) }
        }

        foreach ($serial in $serials) {
            if ($sent[$serial] -eq $state.url) { continue }
            $deepLink = 'dahonmd://server?url=' + [uri]::EscapeDataString($state.url)
            $result = Invoke-AdbWithTimeout -arguments @('-s', $serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', $deepLink, '-p', 'com.dahonmd.field')
            if ($result.ExitCode -eq 0 -and $result.Output -match 'Starting:|Activity not started') {
                $sent[$serial] = $state.url
                Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) Opened link on $serial for $($state.url); confirm Server connected in the app."
            } else {
                Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) Could not open DahonMD on $serial`: $($result.Output.Trim())"
            }
        }
    } catch {
        Add-Content -LiteralPath $LogFile -Value "$(Get-Date -Format o) Phone watcher: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 4
}
