"""Live-plot teacher (or any) training history as epochs complete.

Reads ``*history*.json`` files written by ``save_history`` and redraws
metric curves in real time. Run it in a separate terminal while training.

Usage:
    python -m ai.visualization.live_history --output-dir ai/artifacts/source_labeled_enhanced_cpu_pilot
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.figure import Figure

SSL_METRICS = ("loss", "contrastive", "byol", "mim")
FINETUNE_METRICS = ("loss", "accuracy")
LIVE_FILE = "teacher_live.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, help="Artifact directory holding *_history.json files")
    parser.add_argument("--refresh", type=float, default=2.0, help="Poll interval in seconds")
    return parser.parse_args()


def read_histories(output_dir: Path) -> dict[str, list[dict]]:
    histories: dict[str, list[dict]] = {}
    for path in sorted(output_dir.glob("*history*.json")):
        try:
            histories[path.stem] = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
    return histories


def draw(histories: dict[str, list[dict]], figures: dict[str, plt.Figure]) -> None:
    for name, rows in histories.items():
        if not rows:
            continue
        if name not in figures:
            figures[name] = plt.figure(figsize=(10, 6))
            figures[name].suptitle(name)
        figure = figures[name]
        figure.clear()
        figure.suptitle(name)
        epochs = [row.get("epoch", i + 1) for i, row in enumerate(rows)]
        metrics = list(rows[0].keys())
        phase = rows[0].get("phase", "")
        metric_names = [m for m in metrics if m not in ("phase", "epoch", "learning_rate")]
        ax = figure.add_subplot(111)
        for metric in metric_names:
            values = [row.get(metric) for row in rows]
            if all(v is not None for v in values):
                ax.plot(epochs, values, marker="o", label=metric)
        ax.set_xlabel("epoch")
        ax.set_ylabel("value")
        ax.set_title(phase or name)
        ax.legend()
        ax.grid(True, linestyle="--", alpha=0.4)
    plt.draw()
    plt.pause(0.01)


def draw_live(output_dir: Path, figure: Figure) -> None:
    live_path = output_dir / LIVE_FILE
    if not live_path.is_file():
        return
    try:
        payload = json.loads(live_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    figure.clear()
    figure.suptitle(f"{payload.get('phase', 'training')} - live")
    ax = figure.add_subplot(111)
    total = payload.get("total_batches", 0)
    batch = payload.get("batch", 0)
    progress = batch / total if total else 0.0
    ax.barh([0], [progress], color="#4c9be8", height=0.6)
    ax.set_xlim(0, 1)
    ax.set_yticks([])
    ax.set_xlabel(f"batch {batch}/{total} ({(progress * 100):.1f}%)")
    metrics = payload.get("metrics", {})
    lines = [
        f"epoch {payload.get('epoch')}/{payload.get('total_epochs')}",
        f"learning rate {payload.get('learning_rate', 0):.6f}",
        f"elapsed {time.time() - payload.get('timestamp', time.time()):.0f}s",
    ]
    lines += [f"{name} = {value:.4f}" for name, value in metrics.items()]
    ax.text(0.02, 0.55, "\n".join(lines), fontsize=10, verticalalignment="bottom")
    plt.draw()
    plt.pause(0.01)


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    if not output_dir.is_dir():
        raise SystemExit(f"Output directory not found: {output_dir}")
    plt.ion()
    figures: dict[str, plt.Figure] = {}
    live_figure = plt.figure(figsize=(7, 4))
    print(f"Watching {output_dir} for *history*.json (Ctrl+C to stop)")
    try:
        while True:
            draw_live(output_dir, live_figure)
            histories = read_histories(output_dir)
            if histories:
                draw(histories, figures)
            time.sleep(args.refresh)
    except KeyboardInterrupt:
        print("\nStopped.")
        plt.ioff()
        plt.show()


if __name__ == "__main__":
    main()
