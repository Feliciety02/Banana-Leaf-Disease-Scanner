param(
  # Optional: a teacher or enhanced-student run directory, e.g.:
  #   ai/artifacts/four_class/teacher/runs/20260829_seed42_run01
  [string]$RunDir = ""
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

# Use the newest error log. This supports both the main launcher and the
# one-time fine-tuning restart command.
$log = Get-ChildItem -Path $RunDir -Filter "*.err.log" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName

Write-Host "Monitoring: $RunDir" -ForegroundColor DarkGray

while ($true) {
  Clear-Host
  Write-Host ""
  Write-Host "  DahonMD training monitor (Ctrl+C to exit)" -ForegroundColor Cyan
  Write-Host "  ---------------------------------------" -ForegroundColor DarkGray

  $j = $null
  try { $j = Get-Content $live -Raw -ErrorAction Stop | ConvertFrom-Json } catch {}

  [string]$tail = ""
  if ($log) {
    $tail = Get-Content $log -Tail 1 -ErrorAction SilentlyContinue
    $tail = ($tail -split "`r") | Select-Object -Last 1
  }
  $tm = [regex]::Match($tail, "\[([0-9:]+)<([0-9:]+)")
  $barM = [regex]::Match($tail, "\|\s*(\d+)/(\d+)")

  $et = ""
  if ($tm.Success) { $et = "   epoch elapsed {0} / ETA {1}" -f $tm.Groups[1].Value, $tm.Groups[2].Value }

  if ($j -and $j.epoch) {
    $e = [double]$j.epoch
    $T = [double]$j.total_epochs
    $b = [double]$j.batch
    $B = [double]$j.total_batches

    $phaseLabel = switch ($j.phase) {
      "self_supervised_pretraining" { "SSL pretraining" }
      "supervised_finetuning" { "Supervised fine-tuning" }
      "enhanced_supervised" { "Enhanced supervised training" }
      default { [string]$j.phase }
    }
    if ($j.finetune_stage -eq "head_warmup") {
      $phaseLabel = "$phaseLabel (head warm-up)"
    } elseif ($j.finetune_stage -eq "attention_head_warmup") {
      $phaseLabel = "$phaseLabel (attention + head warm-up)"
    } elseif ($j.finetune_stage -eq "backbone_finetune") {
      $phaseLabel = "$phaseLabel (backbone)"
    }

    Write-Host ("  {0}    epoch {1:0}/{2:0}   batch {3:0}/{4:0}" -f $phaseLabel, $e, $T, $b, $B) -ForegroundColor White

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
      Write-Host ("       {0,5:0.00}%  of this phase ({1:0}/{2:0} epochs)" -f $overall, $e, $T) -ForegroundColor DarkGray
      Write-Host ""
    }

    if ($barM.Success -and [double]$barM.Groups[1].Value -gt $b + 60) {
      Write-Host ("  note: log bar temporarily ahead (batch {0}) - filesystem sync lag, not real" -f $barM.Groups[1].Value) -ForegroundColor DarkGray
    }

    if ($j.phase -in @("supervised_finetuning", "enhanced_supervised") -and $j.metrics) {
      $loss = if ($null -ne $j.metrics.loss) { $j.metrics.loss } else { $j.metrics.train_loss }
      $accuracy = if ($null -ne $j.metrics.accuracy) { $j.metrics.accuracy } else { $j.metrics.train_accuracy }
      Write-Host ("  loss={0:0.0000}  accuracy={1:0.0000}  lr={2:g}" -f `
        [double]$loss, [double]$accuracy, [double]$j.learning_rate) -ForegroundColor DarkYellow

      if ($j.validation_metrics) {
        Write-Host ("  validation: loss={0:0.0000}  accuracy={1:0.0000}  macro_f1={2:0.0000}" -f `
          [double]$j.validation_metrics.validation_loss, `
          [double]$j.validation_metrics.validation_accuracy, `
          [double]$j.validation_metrics.validation_macro_f1) -ForegroundColor DarkCyan
      }
    } elseif ($j.metrics) {
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
