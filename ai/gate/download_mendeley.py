"""Download image folders from public Mendeley Data datasets.

Usage: python download_mendeley.py <dataset_id> <version> <out_dir> [folder-path-filter ...]
A file is kept when its folder path (e.g. "OriginalSet/cordana") contains any
filter string (case-insensitive); with no filters every image is kept.
"""
import json
import shutil
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

API = "https://data.mendeley.com/public-api/datasets"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) dahonmd-gate-data/1.0"}
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=120) as response:
        return json.load(response)


def folder_paths(dataset, version):
    folders = get_json(f"{API}/{dataset}/folders/{version}")
    by_id = {f["id"]: f for f in folders}

    def path_of(folder):
        parts = []
        while folder:
            parts.append(folder["name"])
            folder = by_id.get(folder.get("parent_id"))
        return "/".join(reversed(parts))

    return {f["id"]: path_of(f) for f in folders}


def list_files(dataset, version, folder_id):
    return get_json(f"{API}/{dataset}/files?folder_id={folder_id}&version={version}")


def download(item):
    url, target = item
    if target.exists():
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=180) as response, open(tmp, "wb") as out:
                shutil.copyfileobj(response, out)
            tmp.rename(target)
            return 1
        except Exception:
            if attempt == 3:
                return 0


def main():
    dataset, version, out_dir, *filters = sys.argv[1:]
    out = Path(out_dir)
    paths = folder_paths(dataset, version)
    paths["root"] = ""
    jobs = []
    for folder_id, path in paths.items():
        if filters and not any(f.lower() in path.lower() for f in filters):
            continue
        for entry in list_files(dataset, version, folder_id):
            name = entry["filename"]
            if name.lower().endswith(IMAGE_EXT):
                jobs.append((entry["content_details"]["download_url"], out / path / name))
            elif name.lower().endswith(".zip"):
                print(f"  note: zip archive {path}/{name} ({entry['size'] // 2**20} MB) not fetched", flush=True)
    print(f"{dataset}: {len(jobs)} images in {len({j[1].parent for j in jobs})} folders", flush=True)
    with ThreadPoolExecutor(8) as pool:
        done = sum(pool.map(download, jobs))
    print(f"{dataset}: downloaded {done} new images to {out}", flush=True)


if __name__ == "__main__":
    main()
