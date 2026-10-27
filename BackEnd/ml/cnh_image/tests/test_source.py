"""Carregamento de imagem e PDF para o OCR."""

import tempfile
import unittest
from pathlib import Path

from lib import source
from PIL import Image, JpegImagePlugin  # noqa: F401 - registra o JPEG, que o PDF do Pillow usa


class LoadImagesTests(unittest.TestCase):
    def setUp(self):
        self.directory = Path(tempfile.mkdtemp())
        self.addCleanup(
            lambda: [p.unlink() for p in self.directory.iterdir()] and self.directory.rmdir()
        )

    def test_image_becomes_one_bgr_array(self):
        path = self.directory / "foto.png"
        Image.new("RGB", (40, 30), (255, 0, 0)).save(path)  # vermelho em RGB

        images = source.load_images(str(path))

        self.assertEqual(len(images), 1)
        self.assertEqual(images[0].shape, (30, 40, 3))
        self.assertEqual(tuple(images[0][0, 0]), (0, 0, 255))  # BGR

    def test_huge_photos_are_downscaled(self):
        path = self.directory / "grande.png"
        Image.new("RGB", (source.MAX_SIDE + 800, 600), "white").save(path)

        self.assertEqual(max(source.load_images(str(path))[0].shape[:2]), source.MAX_SIDE)

    def test_pdf_without_embedded_images_is_rendered(self):
        path = self.directory / "pagina.pdf"
        Image.new("RGB", (60, 40), "white").save(path)  # imagem pequena demais: cai no render

        images = source.load_images(str(path))

        self.assertEqual(len(images), 1)
        self.assertGreater(images[0].shape[0], 100)  # página rasterizada, não a imagem de 60x40

    def test_pdf_with_big_embedded_images_uses_them_at_native_size(self):
        path = self.directory / "digital.pdf"
        Image.new("RGB", (900, 600), "white").save(path)

        images = source.load_images(str(path))

        self.assertEqual(len(images), 1)
        self.assertEqual(images[0].shape[:2], (600, 900))


if __name__ == "__main__":
    unittest.main()
