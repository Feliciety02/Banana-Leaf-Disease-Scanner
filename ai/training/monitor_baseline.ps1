param(
  [string]$RunDir = "ai\artifacts\four_class\baseline\runs\20260909_mobilenetv3small_split2878_seed42_run01",
  [int]$RefreshSeconds = 5,
  [switch]$Once
)

$ErrorActionPreference = "SilentlyContinue"
$RunDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($RunDir)
$LogFile = Join-Path $RunDir "training.log"
$StatusFile = Join-Path $RunDir "training_status.txt"
$CompleteFile = Join-Path $RunDir "baseline_training.complete.json"
$PlannedEpochs = 30

function Format-Duration([double]$Seconds) {
  if ($Seconds -lt 0) { return "--" }
  $duration = [TimeSpan]::FromSeconds($Seconds)
  if ($duration.TotalHours -ge 1) {
    return "{0:0}h {1:00}m" -f [Math]::Floor($duration.TotalHours), $duration.Minutes
  }
  return "{0:0}m {1:00}s" -f [Math]::Floor($duration.TotalMinutes), $duration.Seconds
}

function Format-Percent([string]$Value) {
  if (-not $Value) { return "--" }
  return "{0:0.00}%" -f (100.0 * [double]$Value)
}

function Show-Bar([double]$Percent) {
  $bounded = [Math]::Min(100, [Math]::Max(0, $Percent))
  $filled = [int][Math]::Floor($bounded * 0.36)
  return "[{0}{1}] {2,5:0.0}%" -f ("#" * $filled), ("-" * (36 - $filled)), $bounded
}

function Clean-Log([string]$Text) {
  if (-not $Text) { return "" }
  $escape = [string][char]27
  $cleaned = [regex]::Replace($Text, "$escape\[[0-9;?]*[ -/]*[@-~]", "")
  return $cleaned.Replace([string][char]8, "")
}

if (-not (Test-Path -LiteralPath $RunDir)) {
  Write-Host "Run not found: $RunDir" -ForegroundColor Red
  exit 1
}

$startedAt = (Get-Item -LiteralPath $StatusFile).LastWriteTime
if (-not $startedAt) { $startedAt = (Get-Item -LiteralPath $RunDir).CreationTime }

while ($true) {
  $status = if (Test-Path -LiteralPath $StatusFile) {
    (Get-Content -LiteralPath $StatusFile -Raw).Trim()
  } else { "initializing" }
  $complete = Test-Path -LiteralPath $CompleteFile
  $processActive = $status -eq "training" -and -not $complete

  $gpuLine = & nvidia-smi.exe `
    --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw `
    --format=csv,noheader,nounits 2>$null
  $gpu = @("--", "--", "--", "--", "--")
  if ($gpuLine) { $gpu = ($gpuLine | Select-Object -First 1) -split ",\s*" }

  $logLines = if (Test-Path -LiteralPath $LogFile) {
    @(Get-Content -LiteralPath $LogFile | ForEach-Object { Clean-Log $_ })
  } else { @() }

  $epoch = 0
  $phaseEpochs = 0
  $currentMarkerIndex = -1
  for ($index = 0; $index -lt $logLines.Count; $index++) {
    if ($logLines[$index] -match "^Epoch\s+(\d+)/(\d+)") {
      $epoch = [int]$Matches[1]
      $phaseEpochs = [int]$Matches[2]
      $currentMarkerIndex = $index
    }
  }

  $batch = 0
  $batchTotal = 0
  $trainAccuracy = ""
  $trainLoss = ""
  $trainMacroF1 = ""
  $batchPattern = "^\s*(\d+)\s*/\s*(\d+).*?accuracy:\s*([0-9.]+).*?loss:\s*([0-9.]+).*?macro_f1:\s*([0-9.]+)"
  if ($currentMarkerIndex -ge 0) {
    for ($index = $currentMarkerIndex + 1; $index -lt $logLines.Count; $index++) {
      if ($logLines[$index] -notmatch "val_accuracy:" -and $logLines[$index] -match $batchPattern) {
        $batch = [int]$Matches[1]
        $batchTotal = [int]$Matches[2]
        $trainAccuracy = $Matches[3]
        $trainLoss = $Matches[4]
        $trainMacroF1 = $Matches[5]
      }
    }
  }

  $completePattern = "^\s*(\d+)\s*/\s*(\d+).*?accuracy:\s*([0-9.]+).*?loss:\s*([0-9.]+).*?macro_f1:\s*([0-9.]+).*?val_accuracy:\s*([0-9.]+).*?val_loss:\s*([0-9.]+).*?val_macro_f1:\s*([0-9.]+).*?learning_rate:\s*([0-9.eE+-]+)"
  $completed = [System.Collections.Generic.List[object]]::new()
  foreach ($line in $logLines) {
    if ($line -match $completePattern) {
      $duration = if ($line -match "\s(\d+)s\s+\d+s/step") { [double]$Matches[1] } else { 0.0 }
      $values = [regex]::Match($line, $completePattern)
      $completed.Add([pscustomobject]@{
        train_accuracy = $values.Groups[3].Value
        train_loss = $values.Groups[4].Value
        train_macro_f1 = $values.Groups[5].Value
        val_accuracy = $values.Groups[6].Value
        val_loss = $values.Groups[7].Value
        val_macro_f1 = $values.Groups[8].Value
        learning_rate = $values.Groups[9].Value
        duration_seconds = $duration
      })
    }
  }
  $completedCount = $completed.Count
  $latest = if ($completedCount) { $completed[$completedCount - 1] } else { $null }
  $best = $null
  $bestEpoch = 0
  for ($index = 0; $index -lt $completedCount; $index++) {
    if ($null -eq $best -or [double]$completed[$index].val_macro_f1 -gt [double]$best.val_macro_f1) {
      $best = $completed[$index]
      $bestEpoch = $index + 1
    }
  }

  $averageEpochSeconds = 0.0
  $timedEpochs = @($completed | Where-Object { $_.duration_seconds -gt 0 })
  if ($timedEpochs.Count) {
    $averageEpochSeconds = ($timedEpochs | Measure-Object -Property duration_seconds -Average).Average
  }

  $batchFraction = if ($batchTotal) { [Math]::Min(1.0, $batch / $batchTotal) } else { 0.0 }
  $overallPercent = 100.0 * [Math]::Min(1.0, ($completedCount + $batchFraction) / $PlannedEpochs)
  $etaSeconds = if ($averageEpochSeconds -gt 0) {
    [Math]::Max(0, ($PlannedEpochs - $completedCount - $batchFraction) * $averageEpochSeconds)
  } else { -1 }

  $phase = "Preparing data/model"
  if ($phaseEpochs -eq 20) { $phase = "1/2 Classifier training (backbone frozen)" }
  if ($phaseEpochs -eq 10) { $phase = "2/2 Backbone fine-tuning" }

  if (-not $Once) { Clear-Host }
  Write-Host "DAHONMD BASELINE" -ForegroundColor Cyan
  if ($complete -or $status -eq "complete") {
    Write-Host "Status: COMPLETE" -ForegroundColor Green
  } elseif ($processActive) {
    Write-Host "Status: RUNNING" -ForegroundColor Green
  } elseif ($status -match "failed|interrupted") {
    Write-Host "Status: FAILED/INTERRUPTED" -ForegroundColor Red
  } else {
    Write-Host "Status: NOT RUNNING" -ForegroundColor Yellow
  }
  Write-Host ("Phase:  {0}" -f $phase)
  Write-Host ("Time:   {0} elapsed | {1} estimated remaining" -f `
    (Format-Duration ((Get-Date) - $startedAt).TotalSeconds), (Format-Duration $etaSeconds))
  Write-Host ("Overall " + (Show-Bar $overallPercent) + " (max 30 epochs)")

  if ($phaseEpochs) {
    $epochPercent = if ($batchTotal) { 100.0 * $batchFraction } else { 0.0 }
    Write-Host ""
    Write-Host ("Epoch:  {0}/{1} | Batch: {2}/{3}" -f $epoch, $phaseEpochs, $batch, $batchTotal)
    Write-Host ("        " + (Show-Bar $epochPercent))
  }

  Write-Host ""
  Write-Host "CURRENT TRAIN"
  $displayTrainLoss = if ($trainLoss) { $trainLoss } else { "--" }
  Write-Host ("Accuracy {0} | Macro-F1 {1} | Loss {2}" -f `
    (Format-Percent $trainAccuracy), (Format-Percent $trainMacroF1), $displayTrainLoss)

  Write-Host ""
  Write-Host "LATEST VALIDATION"
  if ($latest) {
    Write-Host ("Epoch {0} | Accuracy {1} | Macro-F1 {2} | Loss {3}" -f `
      $completedCount, (Format-Percent $latest.val_accuracy), `
      (Format-Percent $latest.val_macro_f1), $latest.val_loss)
    Write-Host ("Learning rate {0}" -f $latest.learning_rate)
  } else {
    Write-Host "Waiting for first completed epoch"
  }

  Write-Host ""
  Write-Host "BEST VALIDATION"
  if ($best) {
    Write-Host ("Epoch {0} | Macro-F1 {1} | Accuracy {2}" -f `
      $bestEpoch, (Format-Percent $best.val_macro_f1), (Format-Percent $best.val_accuracy))
  } else { Write-Host "--" }

  Write-Host ""
  Write-Host ("GPU: {0}% | VRAM {1}/{2} MiB | {3} C | {4} W" -f `
    $gpu[0], $gpu[1], $gpu[2], $gpu[3], $gpu[4])
  Write-Host "Data: train 8,056 | validation 1,728 | test 1,728 LOCKED"

  if ($complete) { break }
  if (-not $processActive -and $status -match "failed|interrupted") {
    Write-Host ""
    Write-Host "See training.log for the error." -ForegroundColor Red
    break
  }
  if ($Once) { break }
  Write-Host ""
  Write-Host "Ctrl+C closes monitor only." -ForegroundColor DarkGray
  Start-Sleep -Seconds ([Math]::Max(2, $RefreshSeconds))
}
