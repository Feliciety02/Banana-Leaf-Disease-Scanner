param(
  # Optional: a teacher or enhanced-student run directory, e.g.:
  #   ai/artifacts/four_class/teacher/runs/20260829_seed42_run01
  [string]$RunDir = "",
  [int]$RefreshSeconds = 2
)

$base = "ai\artifacts\four_class\teacher\runs"

if (-not $RunDir) {
  $latest = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latest) { $RunDir = $latest.FullName }
}

$live = $null
if ($RunDir) {
  $live = @("$RunDir\teacher_live.json", "$RunDir\student_live.json") |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
}

if (-not $RunDir -or -not $live) {
  Write-Host "No live training status found. Pass -RunDir <teacher-or-student-run-path>." -ForegroundColor Red
  exit 1
}

if ($RefreshSeconds -lt 1) { $RefreshSeconds = 1 }

function Get-LatestLogSnapshot {
  param([string]$Path)

  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $null }

  $stream = $null
  try {
    # tqdm redraws one console line with carriage returns. Reading only the file
    # tail keeps each refresh cheap even after a training log grows very large.
    $stream = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::ReadWrite
    )
    $byteCount = [int][Math]::Min([long](256 * 1024), $stream.Length)
    if ($byteCount -le 0) { return $null }
    $null = $stream.Seek(-$byteCount, [System.IO.SeekOrigin]::End)
    $buffer = New-Object byte[] $byteCount
    $read = $stream.Read($buffer, 0, $buffer.Length)
    $text = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
  } catch {
    return $null
  } finally {
    if ($stream) { $stream.Dispose() }
  }

  $records = @(($text -split "`r`n|`n|`r") | Where-Object { $_.Trim().Length -gt 0 })
  if ($records.Count -eq 0) { return $null }

  # Recovery sessions append to the same log. Do not reuse a progress record
  # from the failed session before the newest resume marker.
  $markerIndex = -1
  for ($index = $records.Count - 1; $index -ge 0; $index--) {
    if ($records[$index] -match '^===== .*RESUME .*=====$') {
      $markerIndex = $index
      break
    }
  }
  $currentRecords = $records
  if ($markerIndex -ge 0) {
    if ($markerIndex + 1 -lt $records.Count) {
      $currentRecords = @($records[($markerIndex + 1)..($records.Count - 1)])
    } else {
      $currentRecords = @()
    }
  }

  $progressLine = $null
  for ($index = $currentRecords.Count - 1; $index -ge 0; $index--) {
    if ($currentRecords[$index] -match '(SSL|Fine-tune) epoch \d+/\d+:') {
      $progressLine = $currentRecords[$index]
      break
    }
  }

  $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  [pscustomobject]@{
    ProgressLine = $progressLine
    HasResumeMarker = ($markerIndex -ge 0)
    LastWriteTime = if ($item) { $item.LastWriteTime } else { $null }
  }
}

function Get-CompletedEpochCount {
  param([string]$Directory)

  foreach ($name in @("teacher_finetune_history.json", "student_history.json")) {
    $path = Join-Path $Directory $name
    if (Test-Path -LiteralPath $path) {
      try { return @((Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)).Count } catch {}
    }
  }
  return 0
}

Write-Host "Monitoring: $RunDir" -ForegroundColor DarkGray

while ($true) {
  Clear-Host
  Write-Host ""
  Write-Host "  DahonMD training monitor (Ctrl+C to exit)" -ForegroundColor Cyan
  Write-Host "  ---------------------------------------" -ForegroundColor DarkGray

  $j = $null
  try { $j = Get-Content -LiteralPath $live -Raw -ErrorAction Stop | ConvertFrom-Json } catch {}

  # Re-select every refresh because a recovery launch can create a newer log
  # while this monitor is already open. This includes training_bfc_resume.log,
  # which the previous monitor accidentally ignored.
  $log = Get-ChildItem -Path $RunDir -Filter "*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
  $snapshot = Get-LatestLogSnapshot -Path $log

  $logMatch = $null
  if ($snapshot -and $snapshot.ProgressLine) {
    $logMatch = [regex]::Match(
      $snapshot.ProgressLine,
      '(?<kind>SSL|Fine-tune) epoch (?<epoch>\d+)/(?<total>\d+):\s*(?<percent>\d+)%.*?\|\s*(?<batch>\d+)/(?<batches>\d+)\s*\[(?<elapsed>[^<,\]]+)(?:<(?<eta>[^,\]]+))?'
    )
  }

  $state = $null
  $liveItem = Get-Item -LiteralPath $live -ErrorAction SilentlyContinue
  if ($j -and $j.epoch) {
    $state = [pscustomobject]@{
      Phase = [string]$j.phase
      FinetuneStage = [string]$j.finetune_stage
      Epoch = [double]$j.epoch
      TotalEpochs = [double]$j.total_epochs
      Batch = [double]$j.batch
      TotalBatches = [double]$j.total_batches
      Percent = $null
      Elapsed = ""
      Eta = ""
      Source = "live cache"
      Updated = if ($liveItem) { $liveItem.LastWriteTime } else { $null }
    }
  }

  if ($logMatch -and $logMatch.Success) {
    $logEpoch = [double]$logMatch.Groups['epoch'].Value
    $logBatch = [double]$logMatch.Groups['batch'].Value
    if (-not $state -or $logEpoch -gt $state.Epoch -or ($logEpoch -eq $state.Epoch -and $logBatch -ge $state.Batch)) {
      $phase = if ($logMatch.Groups['kind'].Value -eq 'SSL') { 'self_supervised_pretraining' } else { 'supervised_finetuning' }
      $stage = if ($j -and $logEpoch -eq [double]$j.epoch) { [string]$j.finetune_stage } else { 'backbone_finetune' }
      $state = [pscustomobject]@{
        Phase = $phase
        FinetuneStage = $stage
        Epoch = $logEpoch
        TotalEpochs = [double]$logMatch.Groups['total'].Value
        Batch = $logBatch
        TotalBatches = [double]$logMatch.Groups['batches'].Value
        Percent = [double]$logMatch.Groups['percent'].Value
        Elapsed = $logMatch.Groups['elapsed'].Value
        Eta = $logMatch.Groups['eta'].Value
        Source = "real-time log"
        Updated = $snapshot.LastWriteTime
      }
    }
  } elseif ($snapshot -and $snapshot.HasResumeMarker -and $liveItem -and $snapshot.LastWriteTime -gt $liveItem.LastWriteTime) {
    # A resume marker newer than the JSON means initialization is in progress.
    # The old 100% cache must not be shown as current-epoch progress.
    $completed = Get-CompletedEpochCount -Directory $RunDir
    $totalEpochs = if ($j -and $j.total_epochs) { [double]$j.total_epochs } else { 0 }
    $totalBatches = if ($j -and $j.total_batches) { [double]$j.total_batches } else { 0 }
    $state = [pscustomobject]@{
      Phase = if ($j) { [string]$j.phase } else { 'supervised_finetuning' }
      FinetuneStage = if ($j) { [string]$j.finetune_stage } else { 'backbone_finetune' }
      Epoch = $completed + 1
      TotalEpochs = $totalEpochs
      Batch = 0
      TotalBatches = $totalBatches
      Percent = 0
      Elapsed = "initializing"
      Eta = "waiting for first batch"
      Source = "resume marker"
      Updated = $snapshot.LastWriteTime
    }
  }

  if ($state -and $state.Epoch) {
    $e = [double]$state.Epoch
    $T = [double]$state.TotalEpochs
    # PowerShell variable names are case-insensitive. Do not use $b and $B for
    # different values: that silently turns every batch fraction into 100%.
    $currentBatch = [double]$state.Batch
    $totalBatches = [double]$state.TotalBatches

    $phaseLabel = switch ($state.Phase) {
      "self_supervised_pretraining" { "SSL pretraining" }
      "supervised_finetuning" { "Supervised fine-tuning" }
      "enhanced_supervised" { "Enhanced supervised training" }
      default { [string]$state.Phase }
    }
    if ($state.FinetuneStage -eq "head_warmup") {
      $phaseLabel = "$phaseLabel (head warm-up)"
    } elseif ($state.FinetuneStage -eq "attention_head_warmup") {
      $phaseLabel = "$phaseLabel (attention + head warm-up)"
    } elseif ($state.FinetuneStage -eq "backbone_finetune") {
      $phaseLabel = "$phaseLabel (backbone)"
    }

    Write-Host ("  {0}    epoch {1:0}/{2:0}   batch {3:0}/{4:0}" -f $phaseLabel, $e, $T, $currentBatch, $totalBatches) -ForegroundColor White

    if ($T -gt 0 -and $totalBatches -gt 0) {
      $pctEpoch = $state.Percent
      if ($null -eq $pctEpoch) { $pctEpoch = 100 * [Math]::Min(1, $currentBatch / [Math]::Max(1, $totalBatches)) }
      $overall = 100 * ($e - 1 + $currentBatch / [Math]::Max(1, $totalBatches)) / $T
      $nb = [int][Math]::Floor(40 * [Math]::Min(100, [Math]::Max(0, $pctEpoch)) / 100)
      $bar = ("#" * $nb).PadRight(40, "-")

      Write-Host ""
      Write-Host ("  |{0}|  {1,5:0.0}%  of epoch {2:0}" -f $bar, $pctEpoch, $e) -ForegroundColor Green
      Write-Host ("       {0,5:0.00}%  of this phase ({1:0}/{2:0} epochs)" -f $overall, $e, $T) -ForegroundColor DarkGray
      Write-Host ""
    }

    if ($j -and [double]$j.epoch -eq $e -and $j.metrics) {
      if ($state.Phase -in @("supervised_finetuning", "enhanced_supervised")) {
        $loss = if ($null -ne $j.metrics.loss) { $j.metrics.loss } else { $j.metrics.train_loss }
        $accuracy = if ($null -ne $j.metrics.accuracy) { $j.metrics.accuracy } else { $j.metrics.train_accuracy }
        if ($null -ne $loss -and $null -ne $accuracy) {
          Write-Host ("  cached metrics: loss={0:0.0000}  accuracy={1:0.0000}  lr={2:g}" -f `
            [double]$loss, [double]$accuracy, [double]$j.learning_rate) -ForegroundColor DarkYellow
        }
        if ($j.validation_metrics) {
          Write-Host ("  validation: loss={0:0.0000}  accuracy={1:0.0000}  macro_f1={2:0.0000}" -f `
            [double]$j.validation_metrics.validation_loss, `
            [double]$j.validation_metrics.validation_accuracy, `
            [double]$j.validation_metrics.validation_macro_f1) -ForegroundColor DarkCyan
        }
      } else {
        Write-Host ("  cached metrics: loss={0:0.0000}  contrastive={1:0.0000}  byol={2:0.0000}  mim={3:0.0000}  lr={4:g}" -f `
          [double]$j.metrics.loss, [double]$j.metrics.contrastive, [double]$j.metrics.byol, [double]$j.metrics.mim, [double]$j.learning_rate) -ForegroundColor DarkYellow
      }
    }

    $age = ""
    if ($state.Updated) {
      $seconds = [Math]::Max(0, [int]((Get-Date) - $state.Updated).TotalSeconds)
      $age = "updated ${seconds}s ago"
    }
    Write-Host ""
    Write-Host ("  source: {0}; {1}" -f $state.Source, $age) -ForegroundColor DarkGray
    if ($state.Elapsed) {
      Write-Host ("  epoch elapsed {0} / ETA {1}" -f $state.Elapsed, $state.Eta) -ForegroundColor DarkGray
    }
  } else {
    Write-Host "  (no current progress yet - trainer may still be initializing)" -ForegroundColor DarkGray
  }

  Start-Sleep -Seconds $RefreshSeconds
}
