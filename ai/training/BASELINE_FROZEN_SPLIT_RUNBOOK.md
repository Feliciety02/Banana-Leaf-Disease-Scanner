# Baseline Training on the Frozen 2,878/Class Split

The next experiment is the standard ImageNet-initialized MobileNetV3-Small
supervised baseline. Training and checkpoint selection use only the frozen
train and validation partitions. Do not evaluate the locked test partition
until every model and hyperparameter choice is final.

## 1. Open WSL at this repository

From PowerShell:

```powershell
wsl
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
```

## 2. Confirm GPU access

Inside WSL:

```bash
/usr/lib/wsl/lib/nvidia-smi
/home/feanne/.venvs/dahonmd-tf-gpu/bin/python -c 'import tensorflow as tf; print(tf.config.list_physical_devices("GPU"))'
```

The second command must print at least one `PhysicalDevice` of type `GPU`.

## 3. Check that no training process is active

```bash
pgrep -af 'ai[.]training[.]train_baseline'
```

No output means the baseline is not currently running.

## 4. Launch the baseline

```bash
bash ai/training/run_baseline_frozen_split_gpu.sh
```

Keep that terminal open. The launcher refuses CPU-only execution, uses the
official frozen split, writes a complete console log, and does not inspect the
test partition. It also refuses to overwrite an incomplete or completed run.

If an earlier run was interrupted, preserve it and start a new run ID:

```bash
export DAHONMD_BASELINE_RUN_ID="20260909_mobilenetv3small_split2878_seed42_run02"
bash ai/training/run_baseline_frozen_split_gpu.sh
```

## 5. Monitor from another PowerShell window

Open the easy-to-read dashboard:

```powershell
& ".\ai\training\monitor_baseline.ps1"
```

It displays the current preparation/training stage, elapsed time, epoch and
batch progress, GPU use, and the latest validation metrics. If needed, the raw
log is still available with:

```powershell
Get-Content ".\ai\artifacts\four_class\baseline\runs\20260909_mobilenetv3small_split2878_seed42_run01\training.log" -Wait -Tail 40
```

Watch GPU utilization:

```powershell
wsl.exe -e /usr/lib/wsl/lib/nvidia-smi -l 2
```

Press `Ctrl+C` in a monitor window to stop only that monitor. To interrupt
training, press `Ctrl+C` once in the WSL training window and wait for the
prompt. Baseline training does not resume mid-run, so use a new run ID for a
clean restart and preserve the interrupted folder as evidence.

## 6. Verify completion

Inside WSL:

```bash
RUN_DIR="ai/artifacts/four_class/baseline/runs/20260909_mobilenetv3small_split2878_seed42_run01"
cat "$RUN_DIR/baseline_training.complete.json"
sha256sum -c "$RUN_DIR/checksums.sha256"
```

Expected outputs include:

- `best_baseline.keras`
- `baseline_history.json`
- `baseline_experiment_config.json`
- `experiment_config.json`
- `training.log`
- `checksums.sha256`
- `baseline_training.complete.json`

After this succeeds, review validation history and freeze the experiment
decision. Do not run test evaluation merely to decide whether the model is
good enough.
