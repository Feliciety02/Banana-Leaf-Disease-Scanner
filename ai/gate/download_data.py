"""Download source images for the banana-leaf photo gate.

Positives (real banana leaf photos) and negatives (anything else, including
paintings, clipart and sketches of plants) land under C:/dmd/gate/raw/.
DomainNet archives are read with HTTP range requests so only the needed
class folders are downloaded, not the multi-GB zips.
"""
import io
import random
import shutil
import tarfile
import urllib.request
import zipfile
from pathlib import Path

RAW = Path(r"C:\dmd\gate\raw")
THESIS = Path(r"C:\Users\feann\OneDrive\Documents\Baseline-Enhanced-Thesis\Baseline-Enhanced-Thesis\Data-Tesis")
random.seed(42)
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) dahonmd-gate-data/1.0"}

MENDELEY_BDR_ORIGINALS = (
    "https://data.mendeley.com/public-files/datasets/79w2n6b4kf/files/"
    "1ab1d654-f4af-4e5f-86c6-8483922b473a/file_downloaded"
)
IMAGENETTE = "https://s3.amazonaws.com/fast-ai-imageclas/imagenette2-160.tgz"
FLOWERS = "https://storage.googleapis.com/download.tensorflow.org/example_images/flower_photos.tgz"
DOMAINNET = {
    "painting": "http://csr.bu.edu/ftp/visda/2019/multi-source/groundtruth/painting.zip",
    "clipart": "http://csr.bu.edu/ftp/visda/2019/multi-source/groundtruth/clipart.zip",
    "sketch": "http://csr.bu.edu/ftp/visda/2019/multi-source/sketch.zip",
    "real": "http://csr.bu.edu/ftp/visda/2019/multi-source/real.zip",
}
# Plant-like classes: drawn versions are the hardest negatives. Real-photo
# plant classes teach "a leaf, but not a banana leaf". palm_tree is excluded
# from the real domain because banana plants are often filed under it.
ART_PLANT_CLASSES = ["leaf", "tree", "house_plant", "flower", "palm_tree", "bush", "grass", "banana", "cactus", "mushroom"]
REAL_PLANT_CLASSES = ["leaf", "tree", "house_plant", "flower", "bush", "grass", "cactus"]
OTHER_PER_DOMAIN = 400  # random non-plant drawings per art domain
IMAGE_EXT = (".jpg", ".jpeg", ".png")


class HttpRangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP range requests (for zipfile)."""

    def __init__(self, url):
        self.url = url
        request = urllib.request.Request(url, method="HEAD", headers=HEADERS)
        with urllib.request.urlopen(request, timeout=60) as response:
            self.size = int(response.headers["Content-Length"])
        self.pos = 0

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.pos, io.SEEK_END: self.size}[whence]
        self.pos = base + offset
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        end = min(self.size, self.pos + n) - 1
        request = urllib.request.Request(self.url, headers={**HEADERS, "Range": f"bytes={self.pos}-{end}"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    data = response.read()
                break
            except Exception:
                if attempt == 3:
                    raise
        self.pos += len(data)
        return data

    def readinto(self, buffer):
        data = self.read(len(buffer))
        buffer[: len(data)] = data
        return len(data)


def download(url, target):
    if target.exists():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=120) as response, open(tmp, "wb") as out:
        shutil.copyfileobj(response, out)
    tmp.rename(target)
    return target


def copy_thesis_positives():
    out = RAW / "positive" / "thesis"
    if out.exists():
        return
    for class_dir in THESIS.iterdir():
        for image in class_dir.iterdir():
            if image.suffix.lower() in IMAGE_EXT:
                dest = out / class_dir.name / image.name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(image, dest)


def extract_zip_images(zip_path, out, include=lambda name: True):
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            name = info.filename
            if info.is_dir() or not name.lower().endswith(IMAGE_EXT) or not include(name):
                continue
            dest = out / Path(name)
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as src, open(dest, "wb") as dst:
                shutil.copyfileobj(src, dst)


def extract_tar_images(tar_path, out, keep):
    with tarfile.open(tar_path) as archive:
        members = [m for m in archive.getmembers() if m.isfile() and m.name.lower().endswith(IMAGE_EXT)]
        random.shuffle(members)
        for member in members[:keep]:
            dest = out / Path(member.name).name
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as src, open(dest, "wb") as dst:
                shutil.copyfileobj(src, dst)


def fetch_domainnet(domain, url, classes, other_count):
    out = RAW / "negative" / f"domainnet_{domain}"
    if out.exists():
        return
    archive = zipfile.ZipFile(io.BufferedReader(HttpRangeFile(url), buffer_size=1 << 20))
    by_class = {}
    for info in archive.infolist():
        parts = info.filename.split("/")
        if len(parts) >= 3 and parts[-1].lower().endswith(IMAGE_EXT):
            by_class.setdefault(parts[-2], []).append(info)
    wanted = [info for name in classes for info in by_class.get(name, [])]
    others = [info for name, infos in by_class.items() if name not in classes for info in infos]
    wanted += random.sample(others, min(other_count, len(others)))
    for index, info in enumerate(wanted):
        category = info.filename.split("/")[-2]
        dest = out / category / Path(info.filename).name
        dest.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as src, open(dest, "wb") as dst:
            shutil.copyfileobj(src, dst)
        if index % 250 == 0:
            print(f"  {domain}: {index}/{len(wanted)}", flush=True)


def main():
    copy_thesis_positives()
    print("thesis positives copied", flush=True)

    bdr_zip = download(MENDELEY_BDR_ORIGINALS, RAW / "downloads" / "bdr_originals.zip")
    if not (RAW / "positive" / "bdr").exists():
        extract_zip_images(bdr_zip, RAW / "positive" / "bdr")
    print("banana disease recognition originals ready", flush=True)

    imagenette = download(IMAGENETTE, RAW / "downloads" / "imagenette2-160.tgz")
    if not (RAW / "negative" / "imagenette").exists():
        extract_tar_images(imagenette, RAW / "negative" / "imagenette", keep=2500)
    flowers = download(FLOWERS, RAW / "downloads" / "flower_photos.tgz")
    if not (RAW / "negative" / "flowers").exists():
        extract_tar_images(flowers, RAW / "negative" / "flowers", keep=1500)
    print("objects and flowers ready", flush=True)

    for domain in ("painting", "clipart", "sketch"):
        fetch_domainnet(domain, DOMAINNET[domain], ART_PLANT_CLASSES, OTHER_PER_DOMAIN)
        print(f"domainnet {domain} ready", flush=True)
    fetch_domainnet("real", DOMAINNET["real"], REAL_PLANT_CLASSES, 0)
    print("domainnet real plants ready", flush=True)

    for group in sorted((RAW / "positive").iterdir()) + sorted((RAW / "negative").iterdir()):
        count = sum(1 for p in group.rglob("*") if p.suffix.lower() in IMAGE_EXT)
        print(f"{group.parent.name}/{group.name}: {count}")


if __name__ == "__main__":
    main()
