import unittest

from PIL import Image

from ai.data.image_fingerprints import difference_hash, flip_aware_difference_hash


class ImageFingerprintTests(unittest.TestCase):
    def test_flip_aware_hash_matches_full_resolution_orientation_method(self) -> None:
        grayscale = Image.effect_noise((512, 384), 64).convert("L")
        image = Image.merge(
            "RGB",
            (
                grayscale,
                grayscale.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
                grayscale.transpose(Image.Transpose.FLIP_TOP_BOTTOM),
            ),
        )

        expected = min(
            difference_hash(variant)
            for variant in (
                image,
                image.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
                image.transpose(Image.Transpose.FLIP_TOP_BOTTOM),
                image.transpose(Image.Transpose.ROTATE_180),
            )
        )

        self.assertEqual(flip_aware_difference_hash(image), expected)

    def test_flip_aware_hash_is_orientation_invariant(self) -> None:
        image = Image.new("L", (32, 24))
        for y in range(image.height):
            for x in range(image.width):
                image.putpixel((x, y), (x * 7 + y * 11) % 256)

        expected = flip_aware_difference_hash(image)
        self.assertEqual(
            flip_aware_difference_hash(image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)),
            expected,
        )
        self.assertEqual(
            flip_aware_difference_hash(image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)),
            expected,
        )
        self.assertEqual(
            flip_aware_difference_hash(image.transpose(Image.Transpose.ROTATE_180)),
            expected,
        )


if __name__ == "__main__":
    unittest.main()
