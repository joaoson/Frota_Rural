"""Validadores: o módulo só devolve o que passa na validação do tipo (precisão > cobertura)."""

import unittest

from lib import validators


class CpfTests(unittest.TestCase):
    def test_valid_cpf_with_or_without_format(self):
        self.assertEqual(validators.parse_cpf("529.982.247-25"), "52998224725")
        self.assertEqual(validators.parse_cpf("52998224725"), "52998224725")
        self.assertEqual(validators.parse_cpf("CPF 529 982 247-25"), "52998224725")

    def test_wrong_check_digit_or_repeated_digits_are_refused(self):
        for text in ("529.982.247-26", "111.111.111-11", "123", "", "texto"):
            with self.subTest(text):
                self.assertIsNone(validators.parse_cpf(text))

    def test_ocr_letter_confusions_are_fixed_in_digits(self):
        self.assertEqual(
            validators.parse_cpf("S29.982.247-2S"), "52998224725"
        )  # S lido no lugar de 5


class DateTests(unittest.TestCase):
    def test_parses_to_iso(self):
        self.assertEqual(validators.parse_date("14/05/1996"), "1996-05-14")
        self.assertEqual(validators.parse_date("1/2/2003"), "2003-02-01")
        self.assertEqual(validators.parse_date("  17 / 06 / 2008 "), "2008-06-17")

    def test_impossible_dates_are_refused(self):
        for text in ("31/02/2020", "00/10/2020", "13/13/2020", "texto", "2020-01-01"):
            with self.subTest(text):
                self.assertIsNone(validators.parse_date(text))


class NumberTests(unittest.TestCase):
    def test_register_number_has_exactly_11_digits(self):
        self.assertEqual(validators.parse_register_number("07665700426"), "07665700426")
        self.assertIsNone(validators.parse_register_number("0766570042"))
        self.assertIsNone(validators.parse_register_number("076657004261"))

    def test_rg_takes_only_the_number_not_the_issuer_or_state(self):
        self.assertEqual(validators.parse_rg("732213587 SESP GO"), "732213587")
        self.assertEqual(validators.parse_rg("12.345.678-9"), "123456789")
        self.assertIsNone(validators.parse_rg("SESP GO"))
        # RG mais antigo, de 7 dígitos + verificador, e verificador "X"
        self.assertEqual(validators.parse_rg("1.234.567-8"), "12345678")
        self.assertEqual(validators.parse_rg("12.345.678-X"), "12345678X")
        self.assertEqual(validators.parse_rg("12.345.678-x SSP SP"), "12345678X")
        self.assertEqual(validators.parse_rg("130135951SESPPR"), "130135951")
        self.assertIsNone(validators.parse_rg("123"))


class TextFieldTests(unittest.TestCase):
    def test_category(self):
        for text, expected in (("B", "B"), ("ab", "AB"), (" e ", "E"), ("X", None), ("ABC", None)):
            with self.subTest(text):
                self.assertEqual(validators.parse_category(text), expected)

    def test_uf(self):
        self.assertEqual(validators.parse_uf("mg"), "MG")
        self.assertIsNone(validators.parse_uf("XX"))

    def test_name(self):
        self.assertEqual(validators.clean_name("  maria  da silva "), "MARIA DA SILVA")
        self.assertEqual(validators.clean_name("D'AVILA SOUZA"), "D'AVILA SOUZA")
        for text in ("A", "12345678", "NOME 123", "!!!!!"):
            with self.subTest(text):
                self.assertIsNone(validators.clean_name(text))


if __name__ == "__main__":
    unittest.main()
