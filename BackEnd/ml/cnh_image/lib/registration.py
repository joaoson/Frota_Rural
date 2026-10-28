"""Registro do documento por âncoras: acha a rotação, a escala e a posição na foto.

Dado um conjunto de rótulos reconhecidos (posição na foto) e a posição esperada de cada um
no modelo (o "template" aprendido do dataset), calcula a transformação de similaridade
(rotação + escala uniforme + translação) que leva a foto para o referencial do template.
Isso resolve de uma vez CNHs de lado, de cabeça para baixo ou inclinadas, sem girar a imagem
e repetir o OCR em 4 orientações. Só usa numpy.
"""

import itertools
from dataclasses import dataclass

import numpy as np

Point = tuple[float, float]


@dataclass(frozen=True)
class Transform:
    """`destino = scale * (rotation @ ponto) + translation`."""

    scale: float
    rotation: np.ndarray
    translation: np.ndarray

    def apply(self, point: Point) -> Point:
        mapped = self.scale * (self.rotation @ np.asarray(point, dtype=float)) + self.translation
        return float(mapped[0]), float(mapped[1])

    def invert(self, point: Point) -> Point:
        """Do referencial do template de volta para a foto."""
        mapped = self.rotation.T @ (
            (np.asarray(point, dtype=float) - self.translation) / self.scale
        )
        return float(mapped[0]), float(mapped[1])

    @property
    def angle_degrees(self) -> float:
        return float(np.degrees(np.arctan2(self.rotation[1, 0], self.rotation[0, 0])))


def fit_similarity(source: np.ndarray, target: np.ndarray) -> Transform | None:
    """Mínimos quadrados (Umeyama) sem reflexão. `source` e `target`: `(n, 2)`, n >= 2."""
    if len(source) < 2:
        return None
    mean_s, mean_t = source.mean(axis=0), target.mean(axis=0)
    centered_s, centered_t = source - mean_s, target - mean_t
    variance = (centered_s**2).sum() / len(source)
    if variance < 1e-9:
        return None
    covariance = centered_t.T @ centered_s / len(source)
    u, singular, vt = np.linalg.svd(covariance)
    sign = np.eye(2)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sign[1, 1] = -1  # evita espelhar: uma foto nunca é a imagem espelhada do documento
    rotation = u @ sign @ vt
    scale = float((singular * np.diag(sign)).sum() / variance)
    if scale <= 0:
        return None
    translation = mean_t - scale * (rotation @ mean_s)
    return Transform(scale, rotation, translation)


def register(
    found: dict[str, Point], template: dict[str, Point], tolerance: float
) -> tuple[Transform, list[str]] | None:
    """Melhor transformação foto→template e as âncoras que ela explica (inliers).

    `found` e `template` mapeiam o mesmo conjunto de chaves de rótulo. Testa todos os trios
    de âncoras (são poucos) e refaz o ajuste só com as que concordam, para um rótulo lido
    errado (ou trocado de lugar) não estragar o resultado. `tolerance` é a distância máxima,
    em unidades do template, para uma âncora contar como concordante.
    """
    keys = [key for key in found if key in template]
    if len(keys) < 3:
        return None
    source = np.array([found[k] for k in keys], dtype=float)
    target = np.array([template[k] for k in keys], dtype=float)

    best: tuple[Transform, np.ndarray] | None = None
    for trio in itertools.combinations(range(len(keys)), 3):
        transform = fit_similarity(source[list(trio)], target[list(trio)])
        if transform is None:
            continue
        mapped = np.array([transform.apply(tuple(p)) for p in source])
        inliers = np.linalg.norm(mapped - target, axis=1) <= tolerance
        if best is None or inliers.sum() > best[1].sum():
            best = (transform, inliers)
    if best is None or best[1].sum() < 3:
        return None

    inlier_idx = np.flatnonzero(best[1])
    refined = fit_similarity(source[inlier_idx], target[inlier_idx]) or best[0]
    return refined, [keys[i] for i in inlier_idx]
