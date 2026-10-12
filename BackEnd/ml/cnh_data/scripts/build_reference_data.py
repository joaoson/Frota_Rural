"""Gera as bases de referência do modelo de dados a partir dos CSVs brutos do IBGE.

Entradas (em `ml/data/raw/`, não versionadas; origem: Base dos Dados / IBGE):
(fontes e links em `ml/data/README.md`, seção "Referências")
- Nomes no Brasil, Censo 2010: https://basedosdados.org/dataset/703f9f0d-caee-4b47-b900-46b1dea2c33c?table=3bc00c7a-28e5-421b-b310-b32bed3dd4d4
- Divisão Territorial Brasileira: https://www.ibge.gov.br/geociencias/organizacao-do-territorio/divisao-regional/23701-divisao-territorial-brasileira.html

- br_ibge_nomes_brasil_quantidade_municipio_nome_2010.csv
  (id_municipio, nome, quantidade_nascimentos_ate_2010)
- br_bd_diretorios_brasil_municipio.csv
  (id_municipio, nome, sigla_uf, ... várias colunas que não usamos)
- ibge_distritos/distritos.json: lista oficial de distritos, baixada da API de localidades do
  IBGE (https://servicodados.ibge.gov.br/api/v1/localidades/distritos). Opcional no script,
  mas obrigatório para o modelo funcionar (ver `reference_available`).

Saídas (em `ml/data/`, versionadas):
- names/first_names.tsv: `nome_normalizado<TAB>quantidade`, do mais ao menos frequente.
- cities/cities.json: `{UF: {cidade_normalizada: peso}}`, onde o peso é o total de
  nascimentos do município na base de nomes (proxy de população, usado só pelo gerador
  de dados sintéticos).
- cities/districts.json: `{UF: [distrito_normalizado, ...]}`, só as localidades reais que não
  são município (distritos cujo nome difere do município sede), da lista oficial do IBGE.

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
DISTRICTS_JSON = RAW_DIR / "ibge_distritos" / "distritos.json"
CITIES_OUT = DATA_DIR / "cities" / "cities.json"
DISTRICTS_OUT = DATA_DIR / "cities" / "districts.json"

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


def _state_of(district: dict) -> str:
    """UF do distrito, pelo caminho município → microrregião → mesorregião → UF."""
    municipality = district["municipio"]
    try:
        return municipality["microrregiao"]["mesorregiao"]["UF"]["sigla"]
    except (KeyError, TypeError):
        return municipality["regiao-imediata"]["regiao-intermediaria"]["UF"]["sigla"]


def build_districts(
    districts_json: Path, cities: dict[str, dict[str, int]]
) -> dict[str, list[str]]:
    """Localidades que não são município: distritos cujo nome difere do município sede.

    Todo município tem um distrito-sede com o mesmo nome (já está em `cities`); também
    descarta nomes que coincidam com algum município da mesma UF.
    """
    districts: dict[str, set[str]] = {}
    for item in json.loads(districts_json.read_text(encoding="utf-8")):
        state = _state_of(item)
        name = normalize_text(item["nome"])
        if (
            name
            and name != normalize_text(item["municipio"]["nome"])
            and name not in cities.get(state, {})
        ):
            districts.setdefault(state, set()).add(name)
    return {uf: sorted(districts[uf]) for uf in sorted(districts)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--names-csv", type=Path, default=NAMES_CSV)
    parser.add_argument("--cities-csv", type=Path, default=CITIES_CSV)
    parser.add_argument("--districts-json", type=Path, default=DISTRICTS_JSON)
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

    if args.districts_json.exists():
        districts = build_districts(args.districts_json, cities)
        DISTRICTS_OUT.write_text(
            json.dumps(districts, ensure_ascii=False, indent=0, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        print(
            f"[INFO] Distritos (localidades que não são município): {sum(map(len, districts.values()))}"
        )
        print(f"[SALVO] {DISTRICTS_OUT}")
    else:
        print(f"[ATENÇÃO] {args.districts_json} não existe: districts.json não foi gerado")

    total_cities = sum(len(names) for names in cities.values())
    print(f"[INFO] Nomes: {len(by_name)} únicos, {sum(by_name.values())} nascimentos")
    print(f"[INFO] Linhas descartadas (nome inválido): {discarded}")
    print(f"[INFO] Cidades: {total_cities} em {len(cities)} UFs")
    print(f"[SALVO] {NAMES_OUT}")
    print(f"[SALVO] {CITIES_OUT}")


if __name__ == "__main__":
    main()
