<#
.DESCRIPTION
DahonMD mobile watch loop: watches the files that determine the APK contents
(mobile-frontend\.env, app.json, index.ts, package.json, package-lock.json,
src\**, assets\**, modules\**) and automatically runs refresh-tunnel.ps1 after
every batch of edits.

refresh-tunnel.ps1 is idempotent and fast when nothing changed, so the loop is
safe to leave running: it only rebuilds the release APK when the mobile
fingerprint actually differs from the last successful build (see
.docx .dahonmd\mobile-build-state.json). Backend, web-frontend, and these
scripts are NOT watched on purpose - the APK never contains that code, and the
app reaches the backend through the tunnel URL at runtime.

Usage:
  .\watch-mobile.ps1                 # watch until Ctrl+C; runs refresh-tunnel.ps1 on changes
  .\watch-mobile.ps1 -DebounceMs 2000# wait 2s of quiet before rebuilding (default 1500)
  .\watch-mobile.ps1 -DryRun         # only announce that a rebuild would run (testing)
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [int]$DebounceMs = 1500,
  [int]$PollMs = 500
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileDir = Join-Path $root 'mobile-frontend'
$runScript = Join-Path $root 'refresh-tunnel.ps1'

# Synchronized shared state between the FileSystemWatcher events (which fire in
# background runspaces) and this main loop.
$events = [hashtable]::Synchronized(@{
  LastChange = $null
  Busy       = $false
})

function Register-DirWatcher([string]$path) {
  if (-not (Test-Path -LiteralPath $path -PathType Container)) { return }
  $watcher = New-Object System.IO.FileSystemWatcher
  $watcher.Path = $path
  $watcher.IncludeSubdirectories = $true
  $watcher.EnableRaisingEvents = $true
  foreach ($name in @('Created', 'Changed', 'Deleted', 'Renamed')) {
    Register-ObjectEvent -InputObject $watcher -EventName $name -MessageData $events -Action {
      $evt = $Event.SourceEventArgs.FullPath
      if ($evt -match '\\node_modules\\' -or $evt -match '(^|\\)build(\\|$)' -or $evt -match '(^|\\)\.gradle(\\|$)' -or $evt -match '(^|\\)\.kotlin(\\|$)') { return }
      $Event.MessageData['LastChange'] = Get-Date
    } | Out-Null
  }
  Write-Host "  watching  $path" -ForegroundColor DarkGray
}

function Register-FileWatcher([string]$path) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return }
  $watcher = New-Object System.IO.FileSystemWatcher
  $watcher.Path = Split-Path -Parent $path
  $watcher.Filter = Split-Path -Leaf $path
  $watcher.IncludeSubdirectories = $false
  $watcher.EnableRaisingEvents = $true
  foreach ($name in @('Created', 'Changed', 'Deleted', 'Renamed')) {
    Register-ObjectEvent -InputObject $watcher -EventName $name -MessageData $events -Action {
      $Event.MessageData['LastChange'] = Get-Date
    } | Out-Null
  }
  Write-Host "  watching  $($watcher.Filter)" -ForegroundColor DarkGray
}

if ($DryRun) {
  Write-Host "=== watch-mobile.ps1 (DRY RUN - will not actually rebuild) ===" -ForegroundColor Cyan
} else {
  Write-Host "=== watch-mobile.ps1 (rebuilds the APK automatically on mobile changes) ===" -ForegroundColor Cyan
}
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host "Watching the files that determine APK contents:" -ForegroundColor DarkGray

foreach ($file in @('.env', 'app.json', 'index.ts', 'package.json', 'package-lock.json')) {
  Register-FileWatcher (Join-Path $mobileDir $file)
}
foreach ($dir in @('src', 'assets', 'modules')) {
  Register-DirWatcher (Join-Path $mobileDir $dir)
}

Write-Host "`nWaiting for changes..." -ForegroundColor DarkGray

while ($true) {
  $last = $events['LastChange']
  if ($last -and -not $events['Busy'] -and ((Get-Date) - $last).TotalMilliseconds -ge $DebounceMs) {
    $events['Busy'] = $true
    try {
      Write-Host "`n[watch] Mobile changes detected - running .\refresh-tunnel.ps1..." -ForegroundColor Cyan
      if ($DryRun) {
        Write-Host "[watch] DRY RUN: would have invoked refresh-tunnel.ps1 here." -ForegroundColor Yellow
      } else {
        & $runScript
      }
    } catch {
      Write-Host "[watch] refresh-tunnel.ps1 failed: $_" -ForegroundColor Red
    } finally {
      $events['Busy'] = $false
      $events['LastChange'] = $null
      Write-Host "`n[watch] Waiting for changes..." -ForegroundColor DarkGray
    }
  }
  Start-Sleep -Milliseconds $PollMs
}