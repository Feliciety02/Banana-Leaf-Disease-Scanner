<#
.SYNOPSIS
  Runs the PILOT-07 seed 2026 distillation student and restarts it automatically
  after a WSL/TensorFlow GPU crash until it finishes.

.DESCRIPTION
  Each attempt:
    - refuses to start if another repository trainer is already running;
    - runs a clean launch when no checkpoint exists, otherwise resumes from the
      latest completed epoch (latest_student.keras + student_history.json);
    - optionally terminates the Ubuntu distro first when the GPU is unhealthy,
      then retries after a delay.
  The loop stops when student_training.complete.json exists, after MaxAttempts
  attempts, or on Ctrl+C. Progress is never lost because the trainer writes a
  checkpoint at the end of every completed epoch.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File ai\training\run_pilot07_seed2026_auto.ps1

.EXAMPLE
  # Preview the exact WSL command without starting training.
  powershell -ExecutionPolicy Bypass -File ai\training\run_pilot07_seed2026_auto.ps1 -DryRun
#>

[CmdletBinding()]
param(
  [string]$Distro = "Ubuntu",
  [string]$PythonBin = "/home/feanne/.venvs/dahonmd-tf-gpu/bin/python",
  [string]$Config = "ai/config/pilot_2878_v1/pilot_07_kd_seed2026.json",
  [string]$DatasetDir = "/home/feanne/dahonmd-data/banana_leaf_thesis_4class",
  [string]$SplitDir = "datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1",
  [string]$OutputDir = "ai/artifacts/four_class/pilot_2878_v1/pilot_07_selected_student_seed2026",
  [string]$TeacherModel = "ai/artifacts/four_class/pilot_2878_v1/pilot_03_teacher_imagenet_seed42/best_teacher.keras",
  [int]$MaxAttempts = 20,
  [int]$RetryDelaySeconds = 45,
  [switch]$NoGpuReset,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function ConvertTo-BashLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + ($Value.Replace("'", "'\''")) + "'"
}

function Test-GpuHealthy {
  & wsl.exe -d $Distro --exec bash -lc "nvidia-smi --query-gpu=name --format=csv,noheader >/dev/null 2>&1" 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Get-ActiveTrainer {
  $found = & wsl.exe -d $Distro --exec bash -lc "pgrep -af 'ai[.]training[.]train_student' || true" 2>$null
  return ($found | Out-String).Trim()
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$repoWsl = "/mnt/" + $repoRoot.Substring(0, 1).ToLower() + ($repoRoot.Substring(2) -replace "\\", "/")

$outputDirFs = Join-Path $repoRoot ($OutputDir -replace "/", "\")
$completionPath = Join-Path $outputDirFs "student_training.complete.json"
$latestPath = Join-Path $outputDirFs "latest_student.keras"
$historyPath = Join-Path $outputDirFs "student_history.json"
$autoLogPath = Join-Path $outputDirFs "auto_rerun.log"

if (-not (Test-Path -LiteralPath $outputDirFs)) {
  New-Item -ItemType Directory -Force -Path $outputDirFs | Out-Null
}

function Write-AutoLog {
  param([Parameter(Mandatory = $true)][string]$Message)
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  if (Test-Path -LiteralPath $outputDirFs) {
    Add-Content -LiteralPath $autoLogPath -Value $line
  }
}

Write-Host "Auto crash-resume driver" -ForegroundColor Cyan
Write-Host "  repository : $repoRoot"
Write-Host "  output     : $OutputDir"
Write-Host "  max tries  : $MaxAttempts"

foreach ($attempt in 1..$MaxAttempts) {
  if (Test-Path -LiteralPath $completionPath) {
    Write-AutoLog "COMPLETE: student_training.complete.json exists."
    exit 0
  }

  $hasLatest = Test-Path -LiteralPath $latestPath
  $hasHistory = Test-Path -LiteralPath $historyPath
  if ($hasLatest -xor $hasHistory) {
    Write-AutoLog "BLOCKED: recovery artifacts are incomplete (latest=$hasLatest history=$hasHistory)."
    exit 1
  }
  $resume = ($hasLatest -and $hasHistory)

  $pythonQ = ConvertTo-BashLiteral $PythonBin
  $configQ = ConvertTo-BashLiteral $Config
  $datasetQ = ConvertTo-BashLiteral $DatasetDir
  $splitQ = ConvertTo-BashLiteral $SplitDir
  $outputQ = ConvertTo-BashLiteral $OutputDir
  $teacherQ = ConvertTo-BashLiteral $TeacherModel
  $logQ = ConvertTo-BashLiteral "$OutputDir/training.log"
  $repoQ = ConvertTo-BashLiteral $repoWsl

  $command = "set -o pipefail; cd $repoQ && mkdir -p $outputQ && export TF_GPU_ALLOCATOR=BFC && " +
    "$pythonQ -u -m ai.training.train_student " +
    "--config $configQ --dataset-dir $datasetQ --final-split-dir $splitQ " +
    "--output-dir $outputQ --teacher-model $teacherQ"
  if ($resume) {
    $command += " --resume"
    $logCommand = "tee -a $logQ"
  } else {
    $logCommand = "tee $logQ"
  }
  $command += " 2>&1 | $logCommand"

  $mode = "clean launch"
  if ($resume) { $mode = "resume" }
  Write-AutoLog "attempt $attempt of $MaxAttempts ($mode) launching in $Distro"

  if ($DryRun) {
    Write-Host "wsl.exe -d $Distro --exec bash -lc $command"
    exit 0
  }

  $active = Get-ActiveTrainer
  if ($active) {
    Write-AutoLog "BLOCKED: a trainer is already running; stop it before using this driver."
    Write-Host $active -ForegroundColor Yellow
    exit 1
  }

  if (-not (Test-GpuHealthy)) {
    if ($NoGpuReset) {
      Write-AutoLog "BLOCKED: GPU is not visible to WSL and -NoGpuReset was set."
      exit 1
    }
    Write-AutoLog "GPU unhealthy; terminating $Distro to reset the device."
    & wsl.exe --terminate $Distro | Out-Null
    Start-Sleep -Seconds $RetryDelaySeconds
  }

  & wsl.exe -d $Distro --exec bash -lc $command
  $exitCode = $LASTEXITCODE
  Write-AutoLog "attempt $attempt exited with code $exitCode"

  if (Test-Path -LiteralPath $completionPath) {
    Write-AutoLog "COMPLETE: student_training.complete.json exists."
    exit 0
  }

  if ($attempt -eq $MaxAttempts) {
    Write-AutoLog "GAVE UP after $MaxAttempts attempts; no completion file."
    exit 1
  }

  Write-AutoLog "run incomplete; recovering before the next attempt."
  if (-not $NoGpuReset) {
    & wsl.exe --terminate $Distro | Out-Null
    Start-Sleep -Seconds 5
  }
  Start-Sleep -Seconds $RetryDelaySeconds
}

exit 1
