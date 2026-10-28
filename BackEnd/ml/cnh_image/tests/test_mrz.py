"""MRZ da CNH digital (ICAO TD1), montada aqui com dados inventados."""

import unittest

from lib import mrz


def build(birth: str, expiration: str, name: str) -> list[str]:
    line1 = "I<BRA000000000<000".ljust(30, "<")
    line2 = (
        f"{birth}{mrz.check_digit(birth)}M{expiration}{mrz.check_digit(expiration)}BRA".ljust(
            29, "<"
        )
        + "0"
    )
    return [line1, line2, name.replace(" ", "<").ljust(30, "<")]


class CheckDigitTests(unittest.TestCase):
    def test_icao_weights(self):
        self.assertEqual(mrz.check_digit("520727"), 3)  # exemplo do documento ICAO 9303
        self.assertEqual(mrz.check_digit("<<<"), 0)


class ParseTests(unittest.TestCase):
    def test_reads_dates_and_name(self):
        lines = build("900115", "310630", "ANA MARIA SOUZA")

        result = mrz.parse(lines)

        self.assertEqual(result["birth_date"], "1990-01-15")
        self.assertEqual(result["expiration_date"], "2031-06-30")
        self.assertEqual(result["name"], "ANA MARIA SOUZA")

    def test_a_wrong_check_digit_drops_that_date(self):
        lines = build("900115", "310630", "ANA SOUZA")
        lines[1] = lines[1][:6] + "9" + lines[1][7:]  # estraga o dígito do nascimento

        result = mrz.parse(lines)

        self.assertNotIn("birth_date", result)
        self.assertIn("expiration_date", result)

    def test_recent_birth_year_is_20xx_and_old_is_19xx(self):
        self.assertEqual(mrz.parse(build("050101", "310630", "A B"))["birth_date"], "2005-01-01")
        self.assertEqual(mrz.parse(build("991231", "310630", "A B"))["birth_date"], "1999-12-31")

    def test_find_lines(self):
        lines = build("900115", "310630", "ANA SOUZA")
        self.assertEqual(mrz.find_lines(["CPF", *lines, "outra coisa"]), lines)
        self.assertIsNone(mrz.find_lines(["só", "duas", lines[0], lines[1]]))


if __name__ == "__main__":
    unittest.main()
