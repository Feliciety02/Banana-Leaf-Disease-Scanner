# Complete GPU Training Guide

This guide shows the recommended next experiment: train the Coordinate
Attention–enhanced MobileNetV3 directly from ImageNet weights before using
knowledge distillation.

Target to beat: baseline validation macro-F1 **0.91231**.

## Before you start

- Use WSL, not the Windows Python environment.
- Keep the training terminal open.
- Never start a second training process while one is already running.
- Use a separate PowerShell window to view progress.
- Do not change the dataset during a training run.

## 1. Open the project in WSL

Open PowerShell and enter WSL:

```powershell
wsl
```

Then go to the project folder:

```bash
cd "/mnt/c/Users/Admin/Documents/Project Fe/DahonMD"
```

The launcher automatically uses the configured Linux GPU Python environment.
Do not activate the Windows `.venv` inside WSL.

On a teammate's computer, the Linux environment may be stored under a different
username. Set its path before starting training:

```bash
export DAHONMD_GPU_PYTHON="/home/<your-wsl-user>/.venvs/dahonmd-tf-gpu/bin/python"
```

Replace `<your-wsl-user>` with the WSL username on that computer.

## 2. Check for an active run

```bash
pgrep -af 'ai[.]training[.]train_enhanced_supervised'
pgrep -af 'ai[.]training[.]train_teacher'
```

No output means it is safe to continue. If a process appears, do not start
another run.

## 3. Start or resume the enhanced model

Run this command once:

```bash
RUN_DIR="ai/artifacts/four_class/enhanced/diagnostics/supervised_imagenet_seed42"

mkdir -p "$RUN_DIR"

bash ai/training/run_enhanced_supervised_gpu.sh \
  > >(tee -a "$RUN_DIR/training.out.log") \
  2> >(tee -a "$RUN_DIR/training.err.log" >&2)
```

Use the same command after a stop; the launcher resumes the latest completed
epoch automatically. Do not add `--resume` yourself.

This run is deliberately supervised: the existing teacher scored only about
0.5524 validation macro-F1, so using it for distillation could hold the student
back. The enhanced run uses the same split and 20+10 epoch transfer-learning
schedule as the baseline:

- Epochs 1–20: train Coordinate Attention and the classifier head.
- Epochs 21–30: fine-tune transferred convolution layers at a lower rate.
- Transferred BatchNorm statistics stay frozen.
- Model selection uses validation macro-F1; the test set stays untouched.

The first launch can stay on `validate_image_inventory` for a while because it
checks and hashes every image. Later launches reuse
`image_validation_cache.json` when the dataset has not changed.

## 4. Monitor progress

Open a second PowerShell window and run:

```powershell
cd "C:\Users\Admin\Documents\Project Fe\DahonMD"

$run = ".\ai\artifacts\four_class\enhanced\diagnostics\supervised_imagenet_seed42"

while (-not (Test-Path "$run\student_live.json")) {
    Write-Host "Waiting for the first 5 batches..."
    Start-Sleep -Seconds 10
}

& ".\ai\training\monitor_training.ps1" -RunDir $run
```

The first batches may take several minutes while TensorFlow prepares the GPU.
Pressing `Ctrl+C` here closes only the monitor, not the training process.
The monitor shows batch progress, epoch percentage, loss, accuracy, learning
rate, and the latest validation macro-F1.

Example:

```text
|##################----------------------| 45% of epoch 16
```

## 5. Stop and resume safely

When possible, stop just after an epoch summary is printed. Then:

1. Press `Ctrl+C` once in the WSL training terminal.
2. Wait for the command prompt to return.
3. Confirm that training stopped:

```bash
pgrep -af 'ai[.]training[.]train_enhanced_supervised'
```

It should print nothing. To resume later, repeat the command from step 3. If a
run stops partway through an epoch, that epoch restarts from the last completed
checkpoint.

Final files are saved in the run folder. Check
`student_supervised_training.complete.json`: `beats_baseline_validation_macro_f1`
must be `true` before claiming an improvement.

## Teacher recovery diagnostic

Use this only when the SSL teacher remains below the supervised baseline. It
does not overwrite the original teacher run.

Run the ImageNet-only diagnostic first:

```bash
cd "/mnt/c/Users/Admin/Documents/Project Fe/DahonMD"

bash ai/training/run_teacher_diagnostics_gpu.sh imagenet
```

This diagnostic trains for at most 20 epochs:

- Epochs 1-5 train only the new classification head.
- Epochs 6-20 fine-tune convolution weights at a lower learning rate.
- ResNet BatchNorm remains frozen to avoid unstable statistics from batch size 2.
- The same frozen train/validation/test assignments are used, and the test set
  is not evaluated.

Its artifacts are written to:

```text
ai/artifacts/four_class/teacher/diagnostics/imagenet_frozen_bn_seed42
```

Monitor it from a separate PowerShell window:

```powershell
cd "C:\Users\Admin\Documents\Project Fe\DahonMD"

& ".\ai\training\monitor_training.ps1" `
  -RunDir ".\ai\artifacts\four_class\teacher\diagnostics\imagenet_frozen_bn_seed42"
```

The same launcher resumes automatically after an interruption. After the
ImageNet result is reviewed, run the matching diagnostic from the completed SSL
encoder with:

```bash
bash ai/training/run_teacher_diagnostics_gpu.sh ssl
```

Do not use `all` for the first attempt; reviewing the ImageNet result before
starting another long run avoids unnecessary GPU time.

## Quick troubleshooting

### Training is very slow

Check for duplicate processes:

```bash
pgrep -af 'ai[.]training[.]train_enhanced_supervised'
pgrep -af 'ai[.]training[.]train_teacher'
```

Also run `nvidia-smi`. GPU memory and usage should be above zero while training.

### The terminal shows repeated progress lines

This is usually only line wrapping from `tqdm`. Do not restart an active run.
Use the PowerShell monitor instead.

### The monitor cannot find live status

Wait a few minutes for the first batches. If no training process is running,
check the latest error messages:

```bash
tail -n 30 "$RUN_DIR/training.err.log"
```

### Teacher diagnostic reports no valid SSL checkpoint

A valid checkpoint ends with a `.complete` file. Incomplete checkpoint files are
ignored so that a damaged save is never loaded.

### Teacher resume reports an optimizer shape mismatch

Make sure the computer is using the current `ai/training/train_teacher.py`.
Older checkpoints may not match the current optimizer layout; ask the project
lead before removing or replacing checkpoint files.
