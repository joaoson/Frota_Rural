"""Testes do gerador das bases de referência, com CSVs minúsculos."""

import tempfile
import unittest
from pathlib import Path

from scripts import build_reference_data as build

NAMES = """id_municipio,nome,quantidade_nascimentos_ate_2010
1,Jose,100
2,Jose,50
1,João,30
2,Joao,20
1,Maria,200
1,?,16
2,Ana Paula,5
"""

CITIES = """id_municipio,nome,sigla_uf,nome_regiao_metropolitana
1,São Paulo,SP,Região Metropolitana de São Paulo
2,Machadinho D'Oeste,RO,
3,Buritis,RO,
4,Buritis,MG,
"""


class BuildReferenceDataTests(unittest.TestCase):
    def setUp(self):
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: [p.unlink() for p in directory.iterdir()] and directory.rmdir())
        self.names_csv = directory / "names.csv"
        self.cities_csv = directory / "cities.csv"
        self.names_csv.write_text(NAMES, encoding="utf-8")
        self.cities_csv.write_text(CITIES, encoding="utf-8")

    def test_names_are_normalized_and_summed_across_municipalities(self):
        by_name, _, discarded = build.build_names(self.names_csv)

        self.assertEqual(by_name["jose"], 150)
        self.assertEqual(by_name["joao"], 50)  # "João" e "Joao" viram o mesmo nome
        self.assertEqual(by_name["maria"], 200)
        self.assertEqual(discarded, 2)  # "?" e "Ana Paula" (só 1º nome, só letras)
        self.assertNotIn("ana paula", by_name)

    def test_births_are_summed_per_municipality(self):
        _, by_municipality, _ = build.build_names(self.names_csv)

        self.assertEqual(by_municipality["1"], 100 + 30 + 200 + 16)
        self.assertEqual(by_municipality["2"], 50 + 20 + 5)

    def test_cities_are_keyed_by_state_and_weighted(self):
        _, by_municipality, _ = build.build_names(self.names_csv)

        cities = build.build_cities(self.cities_csv, by_municipality)

        self.assertEqual(sorted(cities), ["MG", "RO", "SP"])
        self.assertEqual(cities["SP"], {"sao paulo": 346})
        self.assertEqual(cities["RO"]["machadinho d oeste"], 75)
        self.assertIn("buritis", cities["RO"])
        self.assertIn("buritis", cities["MG"])  # mesmo nome, outra UF
        self.assertEqual(cities["MG"]["buritis"], 0)  # município sem nascimentos na base


DISTRICTS = [
    {
        "nome": "São Paulo",
        "municipio": {
            "nome": "São Paulo",
            "microrregiao": {"mesorregiao": {"UF": {"sigla": "SP"}}},
        },
    },
    {
        "nome": "Perus",
        "municipio": {
            "nome": "São Paulo",
            "microrregiao": {"mesorregiao": {"UF": {"sigla": "SP"}}},
        },
    },
    {
        "nome": "Perus",
        "municipio": {"nome": "Outra", "microrregiao": {"mesorregiao": {"UF": {"sigla": "SP"}}}},
    },
    {
        "nome": "Buritis",
        "municipio": {"nome": "Outro", "microrregiao": {"mesorregiao": {"UF": {"sigla": "RO"}}}},
    },
    {
        "nome": "Só Imediata",
        "municipio": {
            "nome": "X",
            "regiao-imediata": {"regiao-intermediaria": {"UF": {"sigla": "MG"}}},
        },
    },
]


class BuildDistrictsTests(unittest.TestCase):
    def test_only_real_localities_are_kept_keyed_by_state(self):
        import json

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "distritos.json"
            path.write_text(json.dumps(DISTRICTS), encoding="utf-8")
            cities = {"SP": {"sao paulo": 1}, "RO": {"buritis": 1}}

            districts = build.build_districts(path, cities)

        self.assertEqual(
            districts["SP"], ["perus"]
        )  # sede (São Paulo) fica de fora; duplicata some
        self.assertNotIn("RO", districts)  # "Buritis" já é município da UF
        self.assertEqual(districts["MG"], ["so imediata"])  # UF pelo caminho alternativo


if __name__ == "__main__":
    unittest.main()
