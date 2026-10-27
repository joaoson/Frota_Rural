"""Casamento tolerante de rótulos: o OCR engole espaços e troca letras."""

import unittest

from lib.layouts import DIGITAL_LABELS, OLD_LABELS, match_label, title_hits
from lib.text import similarity, squash


class SquashTests(unittest.TestCase):
    def test_ignores_case_accents_spaces_and_punctuation(self):
        self.assertEqual(squash("Nº REGISTRO"), "NOREGISTRO")  # o "º" decompõe em "o"
        self.assertEqual(squash("1ª Habilitação"), "1AHABILITACAO")
        self.assertEqual(squash("  Doc. Identidade / Órg. Emissor "), "DOCIDENTIDADEORGEMISSOR")

    def test_similarity(self):
        self.assertEqual(similarity("CPF", "CPF"), 1.0)
        self.assertEqual(similarity("", "CPF"), 0.0)


class MatchLabelTests(unittest.TestCase):
    def test_exact_and_noisy_old_labels(self):
        cases = {
            "NOME": "name",
            "CNOME": "name",
            "NOREGISTRO": "register",
            "Nº REGISTRO": "register",
            "ASSINATURADOPORTADDR": "sign_holder",
            "DATAEMISSAO": "issue",
            "HABILITACAO": "first_license",
            "DOC.IDENTIDADE/ORG.EMISSORUF": "doc",
        }
        for text, key in cases.items():
            with self.subTest(text):
                match = match_label(text, OLD_LABELS)
                self.assertIsNotNone(match)
                self.assertEqual(match[0], key)

    def test_values_and_garbled_text_are_not_labels(self):
        for text in (
            "CPF 896.630.040-53",
            "896.630.040-53",
            "PESSONI VALDILEI EMY",
            "",
            "14/05/1996",
        ):
            with self.subTest(text):
                self.assertIsNone(match_label(text, OLD_LABELS))

    def test_three_letter_labels_need_an_exact_match(self):
        self.assertEqual(match_label("CPF", OLD_LABELS)[0], "cpf")
        self.assertIsNone(match_label("CPE", OLD_LABELS))  # um erro de OCR já recusa: poucas letras

    def test_numbered_digital_labels(self):
        for text, key in (("2e1NOMEESOBRENOME", "name"), ("4aDATAEMISSAO", "issue"), ("4dCPF", "cpf"),
                          ("5NREGISTRO", "register"), ("12OBSERVACOES", "observations")):  # fmt: skip
            with self.subTest(text):
                self.assertEqual(match_label(text, DIGITAL_LABELS)[0], key)


class TitleTests(unittest.TestCase):
    def test_counts_fixed_titles(self):
        texts = ["REPUBLICAFEDERATVADOBRAST", "CARTEIRANACIONALDEHABILITACAO", "algo"]
        self.assertEqual(
            title_hits(texts, ("CARTEIRANACIONALDEHABILITACAO", "PROIBIDOPLASTIFICAR")), 1
        )


if __name__ == "__main__":
    unittest.main()
