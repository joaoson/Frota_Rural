"""Gera as bases de referência do modelo de dados a partir dos CSVs brutos do IBGE.

Entradas (em `ml/data/raw/`, não versionadas; origem: Base dos Dados / IBGE):
- br_ibge_nomes_brasil_quantidade_municipio_nome_2010.csv
  (id_municipio, nome, quantidade_nascimentos_ate_2010)
- br_bd_diretorios_brasil_municipio.csv
  (id_municipio, nome, sigla_uf, ... várias colunas que não usamos)

Saídas (em `ml/data/`, versionadas):
- names/first_names.tsv: `nome_normalizado<TAB>quantidade`, do mais ao menos frequente.
- cities/cities.json: `{UF: {cidade_normalizada: peso}}`, onde o peso é o total de
  nascimentos do município na base de nomes (proxy de população, usado só pelo gerador
  de dados sintéticos).

Uso: ./ml/venv/bin/python ml/cnh_data/scripts/build_reference_data.py
"""

import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.reference import DATA_DIR, normalize_text

RAW_DIR = DATA_DIR / "raw"
NAMES_CSV = RAW_DIR / "br_ibge_nomes_brasil_quantidade_municipio_nome_2010.csv"
CITIES_CSV = RAW_DIR / "br_bd_diretorios_brasil_municipio.csv"
NAMES_OUT = DATA_DIR / "names" / "first_names.tsv"
CITIES_OUT = DATA_DIR / "cities" / "cities.json"

# Um primeiro nome válido: só letras (sem acento, depois de normalizado).
VALID_NAME = re.compile(r"^[a-z]+$")


def build_names(names_csv: Path) -> tuple[Counter[str], Counter[str], int]:
    """Soma nascimentos por nome (nacional) e por município numa única passada."""
    by_name: Counter[str] = Counter()
    by_municipality: Counter[str] = Counter()
    discarded = 0
    with names_csv.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            quantity = int(row["quantidade_nascimentos_ate_2010"])
            by_municipality[row["id_municipio"]] += quantity
            name = normalize_text(row["nome"])
            if VALID_NAME.match(name):
                by_name[name] += quantity
            else:
                discarded += 1
    return by_name, by_municipality, discarded


def build_cities(cities_csv: Path, weights: Counter[str]) -> dict[str, dict[str, int]]:
    cities: dict[str, dict[str, int]] = {}
    with cities_csv.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            state = cities.setdefault(row["sigla_uf"], {})
            city = normalize_text(row["nome"])
            state[city] = state.get(city, 0) + weights.get(row["id_municipio"], 0)
    return {uf: dict(sorted(cities[uf].items())) for uf in sorted(cities)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--names-csv", type=Path, default=NAMES_CSV)
    parser.add_argument("--cities-csv", type=Path, default=CITIES_CSV)
    args = parser.parse_args()

    by_name, by_municipality, discarded = build_names(args.names_csv)
    cities = build_cities(args.cities_csv, by_municipality)

    NAMES_OUT.parent.mkdir(parents=True, exist_ok=True)
    with NAMES_OUT.open("w", encoding="utf-8") as handle:
        for name, count in sorted(by_name.items(), key=lambda item: (-item[1], item[0])):
            handle.write(f"{name}\t{count}\n")

    CITIES_OUT.parent.mkdir(parents=True, exist_ok=True)
    CITIES_OUT.write_text(
        json.dumps(cities, ensure_ascii=False, indent=0, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    total_cities = sum(len(names) for names in cities.values())
    print(f"[INFO] Nomes: {len(by_name)} únicos, {sum(by_name.values())} nascimentos")
    print(f"[INFO] Linhas descartadas (nome inválido): {discarded}")
    print(f"[INFO] Cidades: {total_cities} em {len(cities)} UFs")
    print(f"[SALVO] {NAMES_OUT}")
    print(f"[SALVO] {CITIES_OUT}")


if __name__ == "__main__":
    main()
