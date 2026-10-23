"""Arquivos reais (dataset BID e a CNH digital), se estiverem na máquina e o OCR instalado.

Só afirmam **estrutura** (layout, chaves, validade dos valores), nunca valores: o PDF digital é
um documento pessoal real e não pode aparecer em teste, doc ou commit.
"""

import unittest
from pathlib import Path

from lib import validators
from lib.reader import DIGITAL, OLD, read_document

DATA = Path(__file__).resolve().parent.parent.parent / "data"
PHOTOS = sorted((DATA / "cnh").glob("*_in.jpg"))[:1]
PDF = DATA / "cnh_digital" / "CNH-e.pdf"

try:
    import rapidocr_onnxruntime  # noqa: F401

    HAS_OCR = True
except ImportError:
    HAS_OCR = False


@unittest.skipUnless(HAS_OCR and PHOTOS, "OCR ou dataset ausentes")
class OldPhotoTests(unittest.TestCase):
    def test_reads_an_old_cnh(self):
        reading = read_document(str(PHOTOS[0]))

        self.assertEqual(reading.document_type, OLD)
        self.assertTrue(reading.promotes)
        self.assertTrue(validators.cpf_is_valid(reading.fields["cpf"]))
        self.assertEqual(len(reading.fields["cnh_number"]), 11)
        self.assertRegex(reading.fields["issuing_authority"], r"^DETRAN-[A-Z]{2}$")


@unittest.skipUnless(HAS_OCR and PDF.exists(), "OCR ou CNH digital ausentes")
class DigitalPdfTests(unittest.TestCase):
    def test_reads_a_digital_cnh_pdf(self):
        reading = read_document(str(PDF))

        self.assertEqual(reading.document_type, DIGITAL)
        self.assertTrue(reading.promotes)
        self.assertTrue(validators.cpf_is_valid(reading.fields["cpf"]))
        self.assertNotEqual(
            reading.fields["rg"], reading.fields["cpf"]
        )  # não troca um campo pelo vizinho
        self.assertRegex(reading.fields["birth_place"], r" – [A-Z]{2}$")
        self.assertIn(
            reading.fields["nationality"], {"Brasileiro(a)", "Naturalizado(a)", "Estrangeiro(a)"}
        )


if __name__ == "__main__":
    unittest.main()
