# Enhanced Model GPU Runbook

Use this run to train the Coordinate Attention MobileNetV3 without the weak SSL
teacher. The validation macro-F1 target is **greater than 0.91231**.

## 1. Start or resume training

Open PowerShell:

```powershell
wsl
```

Then run inside WSL:

```bash
cd "/mnt/c/Users/Admin/Documents/Project Fe/DahonMD"

pgrep -af 'ai[.]training[.]train_enhanced_supervised'
```

Continue only if no active trainer is listed:

```bash
export DAHONMD_GPU_PYTHON="/home/feanne/.venvs/dahonmd-tf-gpu/bin/python"

"$DAHONMD_GPU_PYTHON" -c \
'import tensorflow as tf; print("GPU:", tf.config.list_physical_devices("GPU"))'

RUN_DIR="ai/artifacts/four_class/enhanced/diagnostics/supervised_imagenet_seed42"
mkdir -p "$RUN_DIR"

bash ai/training/run_enhanced_supervised_gpu.sh \
  > >(tee -a "$RUN_DIR/training.out.log") \
  2> >(tee -a "$RUN_DIR/training.err.log" >&2)
```

Keep this WSL window open. Use the same command to resume; the launcher detects
the latest completed epoch automatically.

## 2. Open the live monitor

Open a second PowerShell window:

```powershell
cd "C:\Users\Admin\Documents\Project Fe\DahonMD"

$run = ".\ai\artifacts\four_class\enhanced\diagnostics\supervised_imagenet_seed42"

while (-not (Test-Path "$run\student_live.json")) {
    Write-Host "Waiting for training to begin..."
    Start-Sleep -Seconds 10
}

& ".\ai\training\monitor_training.ps1" -RunDir $run
```

`Ctrl+C` in the monitor window closes only the monitor.

## 3. Check the result

After training finishes, run inside WSL:

```bash
cat ai/artifacts/four_class/enhanced/diagnostics/supervised_imagenet_seed42/student_supervised_training.complete.json
```

Only claim an improvement when this value is `true`:

```json
"beats_baseline_validation_macro_f1": true
```

Do not run knowledge distillation unless a corrected teacher first beats the
baseline on the same validation split.
