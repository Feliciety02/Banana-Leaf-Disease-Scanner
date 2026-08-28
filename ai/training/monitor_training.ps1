param(
  # Optional: a specific teacher run directory, e.g.:
  #   ai/artifacts/four_class/teacher/runs/20260829_seed42_run01
  [string]$RunDir = ""
)

$base = "ai\artifacts\four_class\teacher\runs"

if (-not $RunDir) {
  $latest = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latest) { $RunDir = $latest.FullName }
}

if (-not $RunDir -or -not (Test-Path "$RunDir\teacher_live.json")) {
  Write-Host "No teacher live status found under $base. Pass -RunDir <path>." -ForegroundColor Red
  exit 1
}

$log = "$RunDir\pipeline.err.log"
$live = "$RunDir\teacher_live.json"

Write-Host "Monitoring: $RunDir" -ForegroundColor DarkGray

while ($true) {
  Clear-Host
  Write-Host ""
  Write-Host "  DahonMD teacher training monitor (Ctrl+C to exit)" -ForegroundColor Cyan
  Write-Host "  -----------------------------------------------" -ForegroundColor DarkGray

  $j = $null
  try { $j = Get-Content $live -Raw -ErrorAction Stop | ConvertFrom-Json } catch {}

  $tail = Get-Content $log -Tail 1 -ErrorAction SilentlyContinue
  $tail = ($tail -split "`r") | Select-Object -Last 1
  $tm = [regex]::Match($tail, "\[([0-9:]+)<([0-9:]+)")
  $barM = [regex]::Match($tail, "\|\s*(\d+)/(\d+)")

  $et = ""
  if ($tm.Success) { $et = "   epoch elapsed {0} / ETA {1}" -f $tm.Groups[1].Value, $tm.Groups[2].Value }

  if ($j -and $j.epoch) {
    $e = [double]$j.epoch
    $T = [double]$j.total_epochs
    $b = [double]$j.batch
    $B = [double]$j.total_batches

    Write-Host ("  {0}    epoch {1:0}/{2:0}   batch {3:0}/{4:0}" -f $j.phase, $e, $T, $b, $B) -ForegroundColor White

    if ($T -gt 0 -and $B -gt 0) {
      # current-epoch %: prefer the tqdm bar on the log line (must match this epoch);
      # fall back to the batch fraction if the bar is missing/torn.
      $pctEpoch = $null
      $barEpochM = [regex]::Match($tail, "epoch (\d+)/(\d+):\s*(\d+)%")
      if ($barEpochM.Success -and [double]$barEpochM.Groups[1].Value -eq $e) {
        $pctEpoch = [double]$barEpochM.Groups[3].Value
      }
      if ($null -eq $pctEpoch) { $pctEpoch = 100 * [Math]::Min(1, $b / [Math]::Max(1, $B)) }

      $overall = 100 * ($e - 1 + $b / [Math]::Max(1, $B)) / $T
      $nb = [int][Math]::Floor(40 * [Math]::Min(100, [Math]::Max(0, $pctEpoch)) / 100)
      $bar = ("#" * $nb).PadRight(40, "-")

      Write-Host ""
      Write-Host ("  |{0}|  {1,5:0.0}%  of epoch {2:0}" -f $bar, $pctEpoch, $e) -ForegroundColor Green
      Write-Host ("       {0,5:0.00}%  of whole run ({1:0}/{2:0} epochs)" -f $overall, $e, $T) -ForegroundColor DarkGray
      Write-Host ""
    }

    if ($barM.Success -and [double]$barM.Groups[1].Value -gt $b + 60) {
      Write-Host ("  note: log bar temporarily ahead (batch {0}) - filesystem sync lag, not real" -f $barM.Groups[1].Value) -ForegroundColor DarkGray
    }

    if ($j.metrics) {
      Write-Host ("  loss={0:0.0000}  contrastive={1:0.0000}  byol={2:0.0000}  mim={3:0.0000}  lr={4:g}" -f `
        [double]$j.metrics.loss, [double]$j.metrics.contrastive, [double]$j.metrics.byol, [double]$j.metrics.mim, [double]$j.learning_rate) -ForegroundColor DarkYellow
    }
  } else {
    Write-Host "  (no live status yet - still initializing)" -ForegroundColor DarkGray
  }

  Write-Host ""
  Write-Host ("  {0}" -f $et) -ForegroundColor DarkGray
  Start-Sleep -Seconds 2
}