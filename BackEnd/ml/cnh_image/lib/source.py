"""Do arquivo enviado (imagem ou PDF) para as imagens que o OCR vai ler."""

import contextlib
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

MAX_SIDE = 2600  # fotos maiores só deixam o OCR mais lento, sem ler melhor
MIN_PDF_IMAGE = (400, 300)  # descarta logotipos e QR embutidos no PDF
MAX_PDF_IMAGES = 4
PDF_DPI = 300


def load_images(path: str) -> list[np.ndarray]:
    """Imagens BGR do arquivo. Foto/scan dá uma; PDF dá as imagens embutidas (ou a página)."""
    if Path(path).suffix.lower() == ".pdf":
        return _pdf_images(path)
    return [_to_bgr(Image.open(path))]


def _to_bgr(image: Image.Image) -> np.ndarray:
    image = ImageOps.exif_transpose(image).convert("RGB")
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    return np.asarray(image)[:, :, ::-1].copy()


def _pdf_images(path: str) -> list[np.ndarray]:
    """A CNH digital traz frente, verso e MRZ como imagens JPEG embutidas, em resolução nativa
    (muito melhor que rasterizar a página). Sem imagens embutidas, rasteriza a 1ª página."""
    with tempfile.TemporaryDirectory() as directory:
        with contextlib.suppress(OSError, subprocess.SubprocessError):
            subprocess.run(
                ["pdfimages", "-png", path, f"{directory}/img"],
                check=True,
                capture_output=True,
                timeout=30,
            )
        images = []
        for file in sorted(Path(directory).glob("img-*.png")):
            with Image.open(file) as picture:
                if picture.width >= MIN_PDF_IMAGE[0] and picture.height >= MIN_PDF_IMAGE[1]:
                    images.append(_to_bgr(picture))
    if images:
        return images[:MAX_PDF_IMAGES]

    from pdf2image import convert_from_path

    return [_to_bgr(convert_from_path(path, dpi=PDF_DPI, first_page=1, last_page=1)[0])]
