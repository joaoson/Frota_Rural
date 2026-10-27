"""Motor de OCR (RapidOCR/PP-OCR em onnxruntime) com import tardio e falha suave.

O motor vem com os modelos embutidos no wheel (sem download em runtime). Se o pacote não
estiver instalado, `OcrUnavailable` é levantada e o chamador devolve só o resultado da CNN:
a falta de OCR nunca derruba a validação.
"""

import functools
import math
from dataclasses import dataclass

import cv2
import numpy as np

from lib.registration import Transform

Point = tuple[float, float]


class OcrUnavailable(RuntimeError):  # noqa: N818 (nome público, usado por classify e scripts)
    """O pacote `rapidocr-onnxruntime` não está instalado."""


@dataclass(frozen=True)
class TextLine:
    """Um trecho de texto lido, com o polígono na imagem (em pixels) e a confiança (0 a 1)."""

    text: str
    points: tuple[Point, ...]
    score: float

    @property
    def center(self) -> Point:
        xs, ys = zip(*self.points, strict=True)
        return sum(xs) / len(xs), sum(ys) / len(ys)

    @property
    def length(self) -> float:
        """Maior lado do polígono: o comprimento do texto, qualquer que seja a rotação."""
        edges = [
            math.dist(self.points[i], self.points[(i + 1) % len(self.points)])
            for i in range(len(self.points))
        ]
        return max(edges)


@functools.cache
def _get_engine():
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as exc:
        raise OcrUnavailable("rapidocr-onnxruntime não está instalado") from exc
    return RapidOCR()


def read_lines(image: np.ndarray) -> list[TextLine]:
    """Lê todo o texto de uma imagem BGR. As linhas voltam na ordem do detector."""
    result, _ = _get_engine()(image)
    return [
        TextLine(
            text=str(text), points=tuple((float(x), float(y)) for x, y in box), score=float(score)
        )
        for box, text, score in (result or [])
    ]


def reread_line(
    image: np.ndarray, line: TextLine, transform: Transform | None = None
) -> str | None:
    """Relê só o recorte de uma linha, ampliado: recupera espaços que a leitura inteira engoliu.

    Na imagem inteira o reconhecedor às vezes junta palavras ("VALDECIPRESTES"); no recorte
    ampliado ele costuma separar ("VALDECI PRESTES"). `transform` (foto→template) endireita
    o recorte quando o documento está girado.
    """
    height, width = image.shape[:2]
    xs, ys = zip(*line.points, strict=True)
    pad = max(4.0, 0.25 * min(max(xs) - min(xs), max(ys) - min(ys)))
    x0, x1 = max(0, int(min(xs) - pad)), min(width, int(max(xs) + pad))
    y0, y1 = max(0, int(min(ys) - pad)), min(height, int(max(ys) + pad))
    crop = image[y0:y1, x0:x1]
    if crop.size == 0:
        return None
    if transform is not None and abs(transform.angle_degrees) > 1:
        crop = _rotate_upright(crop, transform)
    scale = 3.0
    crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    result, _ = _get_engine()(crop, use_det=False, use_cls=False, use_rec=True)
    return str(result[0][1]) if result else None


def _rotate_upright(crop: np.ndarray, transform: Transform) -> np.ndarray:
    """Gira o recorte pela rotação do documento, sem cortar as bordas."""
    rotation = transform.rotation
    height, width = crop.shape[:2]
    corners = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=float)
    rotated = corners @ rotation.T
    low, high = rotated.min(axis=0), rotated.max(axis=0)
    matrix = np.hstack([rotation, (-low).reshape(2, 1)]).astype(np.float32)
    size = (int(np.ceil(high[0] - low[0])), int(np.ceil(high[1] - low[1])))
    return cv2.warpAffine(
        crop, matrix, size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


def read_region(
    image: np.ndarray, corners: list[Point], height: int = 96
) -> tuple[str, float] | None:
    """Reconhece só um retângulo da foto, sem detectar antes: onde o detector não acha texto.

    `corners` são os 4 cantos do retângulo na foto, na ordem topo-esquerda, topo-direita,
    base-direita, base-esquerda **do documento** (não da foto): a transformação em perspectiva
    endireita o recorte, e por isso funciona com o documento de lado ou de cabeça para baixo.
    O detector falha, por exemplo, em caixas de uma só letra (a categoria da CNH).

    Chama o reconhecedor direto e devolve `(texto, nota)`, sem o corte de confiança do motor,
    que descarta letras isoladas certas (nota ~0,45): o corte fica por conta do chamador.
    """
    top_left, top_right, _, bottom_left = corners
    width = max(
        32,
        int(height * math.dist(top_left, top_right) / max(math.dist(top_left, bottom_left), 1.0)),
    )
    target = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(np.array(corners, dtype=np.float32), target)
    crop = cv2.warpPerspective(
        image, matrix, (width, height), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    crop = cv2.copyMakeBorder(crop, 8, 8, 12, 12, cv2.BORDER_REPLICATE)
    recognized, _ = _get_engine().text_recognizer([crop])  # ([(texto, nota)], tempo)
    if not recognized:
        return None
    text, score = recognized[0]
    return (str(text).strip(), float(score)) if str(text).strip() else None
