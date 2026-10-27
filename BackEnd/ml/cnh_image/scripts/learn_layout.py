"""Aprende o template do layout antigo a partir do ground truth do dataset BID.

1. **Âncoras:** os rótulos do `_gt_ocr.txt` de cada foto são levados ao referencial de uma foto
   de referência (rotação, escala e posição, via `lib/registration.py`); a posição de cada
   rótulo no template é a mediana entre os documentos.
2. **Janelas dos campos:** com os documentos registrados, mede-se onde fica o valor de cada
   campo em relação ao seu rótulo (deslocamento horizontal e vertical, em unidades do template).

Nada disso treina um modelo nem usa o *conteúdo* dos campos: só a geometria. Fotos de um mesmo
documento contam uma vez. O resultado é `models/layout_antiga.json`, usado por
`lib/parse_antiga.py` para registrar e ler uma foto nova.

Uso: ./ml/venv/bin/python ml/cnh_image/scripts/learn_layout.py
"""

import json
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from lib.groundtruth import GtLine, document_key, is_validation, read_gt, truth_lines
from lib.layouts import OLD_LABELS, match_label
from lib.registration import Transform, fit_similarity

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR.parent / "data" / "cnh"
OUTPUT = BASE_DIR / "models" / "layout_antiga.json"
REFERENCE_DOCUMENT = "00000001"  # foto reta, para fixar o referencial (x cresce para a direita)
MIN_ANCHORS = 6
ROUNDS = 3
MAX_ANCHOR_ERROR = (
    15.0  # erro mediano das âncoras acima disto: foto mal registrada, fora do aprendizado
)
# Campos de uma linha: nome do campo -> rótulo de onde partem. (Filiação e observações são
# blocos de várias linhas e usam as janelas entre rótulos vizinhas, ver `parse_antiga.py`.)
SINGLE_LINE_FIELDS = {
    "name": "name",
    "doc": "doc",
    "cpf": "cpf",
    "birth": "birth",
    "category": "category",
    "register": "register",
    "expiration": "expiration",
    "first_license": "first_license",
    "issue": "issue",
    "place": "place",
}
# Campo -> chave da linha de verdade (`groundtruth.truth_lines`) que contém o valor dele.
FIELD_TRUTH = {
    "name": "name", "doc": "rg", "cpf": "cpf", "birth": "birth_date", "category": "category",
    "register": "cnh_number", "expiration": "expiration_date", "first_license": "first_license_date",
    "issue": "issue_date", "place": "issuing_state",
}  # fmt: skip


def classify_lines(lines: list[GtLine]) -> tuple[dict[str, tuple[float, float]], set[int]]:
    """Centro de cada rótulo achado e os índices das linhas que são rótulos."""
    found: dict[str, tuple[float, float]] = {}
    labelled: set[int] = set()
    for index, line in enumerate(lines):
        match = match_label(line.text, OLD_LABELS)
        if match:
            labelled.add(index)
            found.setdefault(match[0], line.center)
    return found, labelled


def robust_spread(values: list[float]) -> tuple[float, float]:
    """(mediana, desvio absoluto mediano em escala de desvio padrão)."""
    median = float(np.median(values))
    return median, 1.4826 * float(np.median(np.abs(np.asarray(values) - median)))


def robust_range(values: list[float], margin: float, spread: float = 4.0) -> list[float]:
    """Mediana ± `spread` desvios absolutos medianos (MAD), mais uma margem.

    Percentis extremos seriam puxados pelos poucos documentos mal registrados; a mediana e o
    MAD ignoram esses casos.
    """
    median = float(np.median(values))
    mad = 1.4826 * float(np.median(np.abs(np.asarray(values) - median)))
    return [round(median - spread * mad - margin, 1), round(median + spread * mad + margin, 1)]


def load_training_documents() -> dict[tuple[str, ...], list[GtLine]]:
    """Um documento por conjunto de textos, só os de treino, com rótulos suficientes."""
    documents: dict[tuple[str, ...], list[GtLine]] = {}
    for path in sorted(DATA_DIR.glob("*_gt_ocr.txt")):
        lines = read_gt(path)
        key = document_key(lines)
        # Os documentos de validação ficam de fora: a avaliação (`evaluate_ocr.py`) os usa.
        if len(classify_lines(lines)[0]) >= MIN_ANCHORS and not is_validation(key):
            documents.setdefault(key, lines)
    return documents


def learn_anchors(
    documents: dict[tuple[str, ...], list[GtLine]],
) -> tuple[dict[str, tuple[float, float]], dict[tuple[str, ...], Transform]]:
    """Posição de cada rótulo no template e a transformação foto→template de cada documento."""
    template = dict(classify_lines(read_gt(DATA_DIR / f"{REFERENCE_DOCUMENT}_gt_ocr.txt"))[0])
    transforms: dict[tuple[str, ...], Transform] = {}
    for round_number in range(ROUNDS):
        mapped: dict[str, list[tuple[float, float]]] = {key: [] for key in OLD_LABELS}
        errors = []
        for key, lines in documents.items():
            found, _ = classify_lines(lines)
            keys = [k for k in found if k in template]
            source = np.array([found[k] for k in keys])
            target = np.array([template[k] for k in keys])
            transform = fit_similarity(source, target)
            if transform is None:
                continue
            points = np.array([transform.apply((float(p[0]), float(p[1]))) for p in source])
            error = np.linalg.norm(points - target, axis=1)
            if np.median(error) > MAX_ANCHOR_ERROR:
                transforms.pop(key, None)
                continue
            transforms[key] = transform
            errors.append(float(np.median(error)))
            for label, point in zip(keys, points, strict=True):
                mapped[label].append((float(point[0]), float(point[1])))
        template = {
            label: (float(np.median([p[0] for p in pts])), float(np.median([p[1] for p in pts])))
            for label, pts in mapped.items()
            if pts
        }
        print(
            f"[INFO] rodada {round_number + 1}: {len(errors)} documentos usados, "
            f"erro mediano {np.median(errors):.1f}, p90 {np.percentile(errors, 90):.1f}"
        )
    return template, transforms


def label_lefts(
    documents: dict[tuple[str, ...], list[GtLine]], transforms: dict[tuple[str, ...], Transform]
) -> dict[str, float]:
    """Borda esquerda de cada rótulo no template (mediana entre os documentos)."""
    lefts: dict[str, list[float]] = {key: [] for key in OLD_LABELS}
    for key, transform in transforms.items():
        for line in documents[key]:
            match = match_label(line.text, OLD_LABELS)
            if match:
                cx, _ = transform.apply(line.center)
                lefts[match[0]].append(cx - line.length * transform.scale / 2)
    return {label: float(np.median(values)) for label, values in lefts.items() if values}


def measure_fields(
    documents: dict[tuple[str, ...], list[GtLine]],
    transforms: dict[tuple[str, ...], Transform],
    template: dict[str, tuple[float, float]],
    left_of: dict[str, float],
) -> dict[str, dict[str, list[float]]]:
    """Onde fica a linha de valor de cada campo (identificada pelo formato) em relação ao rótulo."""
    measured: dict[str, dict[str, list[float]]] = {
        f: {"dy": [], "dx": [], "length": [], "thickness": []} for f in SINGLE_LINE_FIELDS
    }
    for key, transform in transforms.items():
        truth = truth_lines(documents[key])
        for field, label in SINGLE_LINE_FIELDS.items():
            line = truth.get(FIELD_TRUTH[field])
            if line is None or label not in template or label not in left_of:
                continue
            cx, cy = transform.apply(line.center)
            length, thickness = line.length * transform.scale, line.thickness * transform.scale
            values = {
                "dy": cy - template[label][1],
                "dx": cx - length / 2 - left_of[label],
                "length": length,
                "thickness": thickness,
            }
            for name, value in values.items():
                measured[field][name].append(value)
    return measured


def field_window(label: str, measured: dict[str, list[float]]) -> dict:
    """Janela de busca (`dy`, `dx`) e caixa justa (`box`) do valor de um campo."""
    dys, dxs = measured["dy"], measured["dx"]
    thickness = float(np.median(measured["thickness"]))
    dy_median, _ = robust_spread(dys)
    # Caixa a partir da BORDA ESQUERDA do texto (o texto impresso é alinhado à esquerda, então
    # ela é estável), com mediana e MAD: robusta aos poucos documentos em que a linha de
    # referência do GT era outra. A largura cobre o texto mais longo (p95).
    left_median, left_spread = robust_spread(dxs)
    slack = max(6.0, 2.5 * left_spread)
    return {
        "label": label,
        "dy": robust_range(dys, 4.0),
        "dx": robust_range(dxs, 6.0),
        # Caixa JUSTA do valor (x, y, largura, altura) relativa ao canto esquerdo e à altura do
        # rótulo. Justa de propósito: se o recorte pega o rótulo ou a moldura, o reconhecedor
        # erra. O erro do registro é coberto por leituras deslocadas.
        "box": [
            round(left_median - slack, 1),
            round(dy_median - thickness / 2 - 3, 1),
            round(float(np.percentile(measured["length"], 95)) + 2 * slack + 4, 1),
            round(thickness + 6, 1),
        ],
        "samples": len(dys),
    }


def main() -> None:
    documents = load_training_documents()
    print(f"[INFO] {len(documents)} documentos de treino distintos com {MIN_ANCHORS}+ rótulos")
    template, transforms = learn_anchors(documents)
    left_of = label_lefts(documents, transforms)
    measured = measure_fields(documents, transforms, template, left_of)

    anchors = {
        label: {"x": round(point[0], 1), "y": round(point[1], 1), "left": round(left_of[label], 1)}
        for label, point in sorted(template.items())
        if label in left_of
    }
    fields = {
        field: field_window(SINGLE_LINE_FIELDS[field], data)
        for field, data in measured.items()
        if len(data["dy"]) >= 30
    }
    spread = np.median(
        [
            np.linalg.norm(np.array(template[a]) - np.array(template[b]))
            for a in template
            for b in template
            if a < b
        ]
    )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {
                "reference": REFERENCE_DOCUMENT,
                "documents": len(documents),
                "anchor_tolerance": round(float(spread) * 0.08, 1),
                "anchors": anchors,
                "fields": fields,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"[SALVO] {OUTPUT}")
    for field, window in fields.items():
        print(f"    {field:14} dy {window['dy']}  dx {window['dx']}  ({window['samples']} docs)")


if __name__ == "__main__":
    main()
