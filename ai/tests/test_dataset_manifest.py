import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai.config.config import ExperimentConfig
from ai.config.labels import CLASS_LABELS
from ai.data.dataset import prepare_splits


class DatasetManifestInventoryTest(unittest.TestCase):
    def test_existing_manifest_rejects_new_images(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            dataset = workspace / "dataset"
            for class_index, class_name in enumerate(CLASS_LABELS):
                class_dir = dataset / class_name
                class_dir.mkdir(parents=True)
                for image_index in range(3):
                    Image.new(
                        "RGB",
                        (4, 4),
                        (class_index * 30, image_index * 40, class_index * 30 + image_index),
                    ).save(class_dir / f"{image_index}.png")

            config = ExperimentConfig()
            config.data.dataset_dir = str(dataset)
            config.data.group_manifest = None
            config.data.verify_images = True
            manifest = workspace / "split_manifest.json"

            prepare_splits(config, manifest)
            Image.new("RGB", (4, 4), (255, 254, 253)).save(dataset / "healthy" / "new.png")

            with self.assertRaisesRegex(ValueError, "Dataset inventory changed"):
                prepare_splits(config, manifest)


if __name__ == "__main__":
    unittest.main()
