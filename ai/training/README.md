# Four-class GPU training runbook

This runbook covers the local WSL GPU pipeline for the four-class baseline,
ResNet-101 SSL teacher, and enhanced CA-MobileNetV3-Small student.

The commands below use this teacher run directory:

```text
ai/artifacts/four_class/teacher/runs/20260829_seed42_run01
```

## Important rules

- Run only one `run_four_class_enhanced_gpu.sh` process at a time.
- Do not activate the Windows `.venv` inside WSL. The launcher uses the Linux
  GPU Python configured by `DAHONMD_GPU_PYTHON` or its built-in default.
- Keep the training terminal open.
- Use a separate PowerShell terminal for the monitor.
- During SSL, stop after the `Intermediate SSL checkpoint saved` message when
  possible.
- The every-epoch recovery policy applies to SSL. Do not intentionally stop
  during supervised fine-tuning without first checking its separate resume
  procedure.

## 1. Enter WSL

Open Windows PowerShell:

```powershell
wsl
```

Inside WSL, enter the repository:

```bash
cd "/mnt/c/Users/Admin/Documents/Project Fe/DahonMD"
```

Ignore any `zsh: parse error near '&'` caused by VS Code attempting to run a
Windows PowerShell activation command inside WSL. That activation is not
needed for this launcher.

## 2. Confirm training is not already running

```bash
pgrep -af 'ai[.]training[.]train_teacher'
pgrep -af '[r]un_four_class_enhanced_gpu'
```

Both commands should print nothing. If a teacher process is already listed,
do not launch another copy.

## 3. Start training

The following form keeps ordinary output visible and appends the long `tqdm`
progress lines to the error log used by the PowerShell monitor. Keeping those
lines out of the WSL terminal prevents VS Code from displaying wrapped,
apparently duplicated progress updates:

```bash
RUN_DIR="ai/artifacts/four_class/teacher/runs/20260829_seed42_run01"

mkdir -p "$RUN_DIR"

bash ai/training/run_four_class_enhanced_gpu.sh \
  > >(tee -a "$RUN_DIR/pipeline.out.log") \
  2>> "$RUN_DIR/pipeline.err.log"
```

Run this command only once. A fresh directory begins SSL at epoch 1. A valid
checkpoint causes automatic resume instead. Use the PowerShell monitor in step
4 for live progress. Errors are also written to `pipeline.err.log`; inspect its
final lines if training stops unexpectedly.

## 4. Monitor from PowerShell

Open a second Windows PowerShell terminal. The trainer creates
`teacher_live.json` after batch 5; the first batch can take several minutes
while TensorFlow traces and compiles the GPU graph. This command waits for the
live-status file and then starts the monitor automatically:

```powershell
cd "C:\Users\Admin\Documents\Project Fe\DahonMD"

$run = ".\ai\artifacts\four_class\teacher\runs\20260829_seed42_run01"

while (-not (Test-Path "$run\teacher_live.json")) {
    Write-Host "Waiting for the first 5 batches..."
    Start-Sleep -Seconds 10
}

& ".\ai\training\monitor_training.ps1" -RunDir $run
```



Pressing `Ctrl+C` in this PowerShell window stops either the wait loop or the
monitor. It does not stop training in WSL.

## SSL checkpoint policy

SSL creates a resumable checkpoint after every completed epoch:

```text
ssl_checkpoint_interval = 1
max_recent_checkpoints = 3
milestone_interval = 10
```

For epoch 8, a complete set is:

```text
ssl_checkpoint_epoch_008_online.npz
ssl_checkpoint_epoch_008_target.npz
ssl_checkpoint_epoch_008_optimizer.npz
ssl_checkpoint_epoch_008_meta.json
ssl_checkpoint_epoch_008.complete
```

The files preserve the online model, EMA/BYOL target, optimizer state and
iteration, completed epoch, and relevant metadata. `teacher_ssl_history.json`
keeps the complete epoch history.

The `.complete` marker is committed last. An interrupted or incomplete set is
ignored. The system retains the latest three valid sets and every tenth-epoch
milestone, pruning only older complete non-milestones after a newer set has
committed.

Resume restores training state, but it is not proven bit-for-bit deterministic:
global TensorFlow, augmentation, and random-mask RNG streams are not restored.

## 5. Verify a checkpoint

Wait for a message like:

```text
Intermediate SSL checkpoint saved at epoch 8 (ssl_checkpoint_epoch_008.complete)
```

Then list the newest completion marker:

```bash
find "$RUN_DIR" -maxdepth 1 \
  -name 'ssl_checkpoint_epoch_*.complete' \
  -printf '%f\n' | sort | tail -1
```

Do not stop while an epoch checkpoint is still being written. The printed
message confirms the marker and retention pass completed.

## 6. Stop safely

In the WSL terminal running training:

1. Wait for the checkpoint-saved message when possible.
2. Press `Ctrl+C` once.
3. Wait for the shell prompt to return.
4. Confirm the process is gone:

```bash
pgrep -af 'ai[.]training[.]train_teacher'
```

It should print nothing. It is then safe to shut down the laptop.

`training_status.txt` may contain `failed` after `Ctrl+C`; the launcher trap
uses that status for any interrupted command. This does not invalidate an
existing `.complete` checkpoint.

If `Ctrl+C` does not stop the process after about 30 seconds, open another WSL
terminal and use:

```bash
pkill -TERM -f 'ai[.]training[.]train_teacher'
```

## 7. Resume later

After turning the laptop back on, repeat the process check and run the exact
same launch command:

```bash
cd "/mnt/c/Users/Admin/Documents/Project Fe/DahonMD"

pgrep -af 'ai[.]training[.]train_teacher'

RUN_DIR="ai/artifacts/four_class/teacher/runs/20260829_seed42_run01"

bash ai/training/run_four_class_enhanced_gpu.sh \
  > >(tee -a "$RUN_DIR/pipeline.out.log") \
  2>> "$RUN_DIR/pipeline.err.log"
```

The launcher uses this precedence:

1. If `best_teacher.keras` exists, teacher training is treated as finished.
2. If `resnet101_ssl_pretrained.keras` exists, SSL is skipped and fine-tuning
   can proceed.
3. If a valid `ssl_checkpoint_epoch_*.complete` exists, SSL resumes from the
   newest valid epoch.
4. Otherwise, SSL starts from epoch 1.

For example, checkpoint epoch 8 restores its model, EMA target, optimizer, and
history, then starts epoch 9.

## Interruption examples

| Event                                          | Next start                                        |
| ---------------------------------------------- | ------------------------------------------------- |
| Stop after epoch 8 checkpoint completes        | Epoch 9                                           |
| Stop halfway through epoch 9                   | Epoch 9 from the epoch 8 checkpoint               |
| Crash while epoch 8 is being saved             | Latest earlier valid checkpoint, normally epoch 7 |
| No`.complete` checkpoint exists              | Epoch 1                                           |
| Final`resnet101_ssl_pretrained.keras` exists | Skip SSL                                          |

## Troubleshooting

### Training is extremely slow or memory warnings appear

Check for duplicate teacher processes:

```bash
pgrep -af 'ai[.]training[.]train_teacher'
```

More than one result means multiple trainers are competing for RAM and GPU
memory. Stop the duplicates before continuing.

### Progress appears on many repeated or wrapped terminal lines

This is a display artifact, not repeated training. `tqdm` refreshes one long
line with carriage returns; piping that line through `tee` can make the VS Code
terminal wrap it and retain old refreshes. Use the launch command in step 3,
which writes stderr directly to `pipeline.err.log`, and watch progress through
the PowerShell monitor.

Do not restart an active run merely to clean up its terminal display. Widen or
minimize the current training terminal and switch to the monitor. Use the quiet
launch command the next time training is started or resumed.

### Resume fails with `Optimizer variable ... has shape ... not compatible`

This happened once when the run was resumed after the resumable-SSL feature had
just been added. The SSL phase never trains the `logits` classification head, so
the optimizer only ever builds slots for the variables that actually receive SSL
gradients. The saved `*_optimizer.npz` therefore contains 862 slots, whereas an
eager `ssl_optimizer.build(online.trainable_variables)` in the resume path
creates 866 (the extra four belong to the `logits` kernel/bias). The extra slots
shift every optimizer array, so restore fails with a shape mismatch on the
logits optimizer variable.

This is fixed in `train_teacher.py`: resume now builds the SSL optimizer over
`_ssl_trainable_variables(online)`, the logits-excluded set that mirrors how the
checkpoint was originally saved. If you still see a shape mismatch on resume,
confirm your checkout includes that helper and that you are running the current
`train_teacher.py` (the fix must be present on the machine that launches
training). If the checkpoint was written by an older, incompatible layout, the
safest recovery is to start SSL from epoch 1 by removing the intermediate
checkpoints under the run directory.

### `No valid intermediate SSL checkpoint found`

Verify that a full five-file set exists and ends in `.complete`. Payload files
without the completion marker are intentionally ignored.

### `No teacher live status found`

The monitor requires `teacher_live.json`, which the teacher writes after every
five batches. Seeing this message immediately after launch normally means the
first batch is still tracing or compiling. Use the wait loop in step 4 instead
of repeatedly launching the monitor.

Confirm that training is still running from WSL:

```bash
pgrep -af 'ai[.]training[.]train_teacher'
```

If a teacher process is listed, do not start another one. If no process is
listed, inspect the end of `pipeline.err.log` for a traceback before resuming.
Because the launcher uses `tee -a`, errors from an earlier attempt remain in
the log; use the final lines and their timestamps to diagnose the current run.

### TensorFlow reports `use_unbounded_threadpool` as an unknown attribute

This warning has been observed while the input pipeline continues running. It
does not by itself indicate a failed checkpoint or stopped training. Diagnose
it further only if training stops or a traceback follows.

### GPU verification

Inside Windows PowerShell or WSL, use:

```text
nvidia-smi
```

During training, GPU memory and utilization should be nonzero. When every
training process has stopped, utilization should return to idle.
