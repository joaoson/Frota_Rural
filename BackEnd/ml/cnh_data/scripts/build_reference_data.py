"""Gera as bases de referência do modelo de dados a partir das fontes do IBGE.

Entradas (em `ml/data/raw/`, não versionadas; fontes e links em `ml/data/README.md`):
- br_ibge_nomes_brasil_quantidade_municipio_nome_2010.csv — Base dos Dados, "Nomes no Brasil"
  (Censo 2010): `nome, quantidade_nascimentos_ate_2010` (a coluna `id_municipio` não é usada).
- dtb_2025/RELATORIO_DTB_BRASIL_2025_MUNICIPIOS.ods — IBGE, Divisão Territorial Brasileira
  (DTB) 2025, data base 31/12/2025. É a única fonte de UF e municípios. (O IBGE publica o mesmo conteúdo em `.xls` e `.ods`; usamos o `.ods`
  porque é um zip de XML, legível sem nenhuma biblioteca extra.)

Saídas (em `ml/data/`, versionadas):
- names/first_names.tsv: `nome_normalizado<TAB>quantidade`, do mais ao menos frequente.
- cities/cities.json: `{UF: [municipio_normalizado, ...]}`, em ordem alfabética.

Uso: ./ml/venv/bin/python ml/cnh_data/scripts/build_reference_data.py
"""

import argparse
import csv
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.reference import DATA_DIR, normalize_text

RAW_DIR = DATA_DIR / "raw"
NAMES_CSV = RAW_DIR / "br_ibge_nomes_brasil_quantidade_municipio_nome_2010.csv"
MUNICIPALITIES_ODS = RAW_DIR / "dtb_2025" / "RELATORIO_DTB_BRASIL_2025_MUNICIPIOS.ods"
NAMES_OUT = DATA_DIR / "names" / "first_names.tsv"
CITIES_OUT = DATA_DIR / "cities" / "cities.json"

# Um primeiro nome válido: só letras (sem acento, depois de normalizado).
VALID_NAME = re.compile(r"^[a-z]+$")

# O relatório da DTB identifica a UF pelo código numérico do IBGE e pelo nome por extenso.
UF_BY_CODE = {
    "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
    "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL",
    "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR",
    "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
}  # fmt: skip

_TABLE = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
_TEXT = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
_MAX_REPEAT = 40  # células vazias repetidas (number-columns-repeated) no fim da linha


def read_ods_rows(path: Path) -> list[list[str]]:
    """Linhas não vazias da primeira aba de um `.ods`, como listas de texto."""
    with zipfile.ZipFile(path) as archive:
        root = ElementTree.fromstring(archive.read("content.xml"))
    rows = []
    for row in next(root.iter(_TABLE + "table")).iter(_TABLE + "table-row"):
        cells: list[str] = []
        for cell in row:
            if cell.tag not in (_TABLE + "table-cell", _TABLE + "covered-table-cell"):
                continue
            text = "".join("".join(p.itertext()) for p in cell.findall(_TEXT + "p"))
            repeat = int(cell.get(_TABLE + "number-columns-repeated", "1"))
            cells.extend([text.strip()] * min(repeat, _MAX_REPEAT))
        if any(cells):
            rows.append(cells)
    return rows


def read_dtb(path: Path) -> list[dict[str, str]]:
    """Linhas de dados de um relatório da DTB, indexadas pelos nomes das colunas.

    O relatório começa com linhas de título; o cabeçalho é a linha que abre com `UF`. As linhas
    de dados são as que têm o código numérico da UF na primeira coluna.
    """
    rows = read_ods_rows(path)
    header_at = next(i for i, row in enumerate(rows) if row[0] == "UF")
    header = rows[header_at]
    return [
        dict(zip(header, row, strict=False))
        for row in rows[header_at + 1 :]
        if row[0] in UF_BY_CODE
    ]


def build_names(names_csv: Path) -> tuple[Counter[str], int]:
    """Soma os nascimentos de cada primeiro nome em todos os municípios."""
    by_name: Counter[str] = Counter()
    discarded = 0
    with names_csv.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            quantity = int(row["quantidade_nascimentos_ate_2010"])
            name = normalize_text(row["nome"])
            if VALID_NAME.match(name):
                by_name[name] += quantity
            else:
                discarded += 1
    return by_name, discarded


def build_cities(municipalities: list[dict[str, str]]) -> dict[str, list[str]]:
    """`{UF: [município, ...]}` a partir do relatório de municípios da DTB."""
    cities: dict[str, set[str]] = {}
    for row in municipalities:
        cities.setdefault(UF_BY_CODE[row["UF"]], set()).add(normalize_text(row["Nome_Município"]))
    return {uf: sorted(cities[uf]) for uf in sorted(cities)}


def _write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=0, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--names-csv", type=Path, default=NAMES_CSV)
    parser.add_argument("--municipalities-ods", type=Path, default=MUNICIPALITIES_ODS)
    args = parser.parse_args()

    by_name, discarded = build_names(args.names_csv)
    cities = build_cities(read_dtb(args.municipalities_ods))

    NAMES_OUT.parent.mkdir(parents=True, exist_ok=True)
    with NAMES_OUT.open("w", encoding="utf-8") as handle:
        for name, count in sorted(by_name.items(), key=lambda item: (-item[1], item[0])):
            handle.write(f"{name}\t{count}\n")
    _write_json(CITIES_OUT, cities)

    print(f"[INFO] Nomes: {len(by_name)} únicos, {sum(by_name.values())} nascimentos")
    print(f"[INFO] Linhas descartadas (nome inválido): {discarded}")
    print(f"[INFO] Municípios: {sum(map(len, cities.values()))} em {len(cities)} UFs")
    print(f"[SALVO] {NAMES_OUT}")
    print(f"[SALVO] {CITIES_OUT}")


if __name__ == "__main__":
    main()
