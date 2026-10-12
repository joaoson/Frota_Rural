"""Testes do gerador das bases de referência, com CSVs minúsculos."""

import tempfile
import unittest
import zipfile
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


class BuildReferenceDataTests(unittest.TestCase):
    def setUp(self):
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: [p.unlink() for p in directory.iterdir()] and directory.rmdir())
        self.names_csv = directory / "names.csv"
        self.names_csv.write_text(NAMES, encoding="utf-8")

    def test_names_are_normalized_and_summed_across_municipalities(self):
        by_name, discarded = build.build_names(self.names_csv)

        self.assertEqual(by_name["jose"], 150)
        self.assertEqual(by_name["joao"], 50)  # "João" e "Joao" viram o mesmo nome
        self.assertEqual(by_name["maria"], 200)
        self.assertEqual(discarded, 2)  # "?" e "Ana Paula" (só 1º nome, só letras)
        self.assertNotIn("ana paula", by_name)


def municipality(uf, code, name):
    return {"UF": uf, "Código Município Completo": code, "Nome_Município": name}


class BuildCitiesTests(unittest.TestCase):
    def test_cities_are_keyed_by_state_abbreviation_and_sorted(self):
        rows = [
            municipality("35", "3550308", "São Paulo"),
            municipality("11", "1100015", "Machadinho D'Oeste"),
            municipality("11", "1100999", "Buritis"),
            municipality("31", "3100001", "Buritis"),  # mesmo nome, outra UF
            municipality("11", "1100998", "Buritis"),  # duplicata na mesma UF
        ]

        cities = build.build_cities(rows)

        self.assertEqual(
            cities,
            {
                "MG": ["buritis"],
                "RO": ["buritis", "machadinho d oeste"],
                "SP": ["sao paulo"],
            },
        )

    def test_every_state_code_maps_to_an_abbreviation(self):
        self.assertEqual(len(build.UF_BY_CODE), 27)
        self.assertEqual(build.UF_BY_CODE["53"], "DF")
        self.assertEqual(build.UF_BY_CODE["35"], "SP")


ODS_CONTENT = """<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:spreadsheet><table:table table:name="DTB">
<table:table-row><table:table-cell><text:p>TÍTULO : BET</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell/></table:table-row>
<table:table-row>
 <table:table-cell><text:p>UF</text:p></table:table-cell>
 <table:table-cell><text:p>Nome_Município</text:p></table:table-cell>
 <table:table-cell table:number-columns-repeated="30"/>
</table:table-row>
<table:table-row>
 <table:table-cell><text:p>35</text:p></table:table-cell>
 <table:table-cell><text:p>São Paulo</text:p></table:table-cell>
</table:table-row>
<table:table-row>
 <table:table-cell><text:p>99</text:p></table:table-cell>
 <table:table-cell><text:p>Nota de rodapé</text:p></table:table-cell>
</table:table-row>
</table:table></office:spreadsheet></office:body></office:document-content>
"""


class ReadDtbTests(unittest.TestCase):
    def test_reads_header_and_keeps_only_rows_with_a_state_code(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dtb.ods"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("content.xml", ODS_CONTENT)

            rows = build.read_dtb(path)

        self.assertEqual(
            rows, [{"UF": "35", "Nome_Município": "São Paulo"}]
        )  # sem título nem rodapé


if __name__ == "__main__":
    unittest.main()
