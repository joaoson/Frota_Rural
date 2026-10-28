"""Parser do layout numerado (CNH digital), com linhas de OCR simuladas e dados inventados."""

import unittest

from lib import mrz
from lib.ocr import TextLine
from lib.parse_digital import apply_mrz, labels_found, merge, parse_digital


def line(text: str, x: float, y: float, width: float = 200.0, height: float = 16.0) -> TextLine:
    return TextLine(text, ((x, y), (x + width, y), (x + width, y + height), (x, y + height)), 0.9)


def front() -> list[TextLine]:
    """Frente: cada rótulo com o valor logo abaixo, como no layout numerado."""
    return [
        line("CARTEIRANACIONALDEHABILITACAO/DRIVERLICENSE", 160, 120),
        line("2e1NOMEESOBRENOME", 180, 170), line("ANAMARIASOUZA", 180, 192),
        line("1°HABILITACAO", 790, 170), line("03/10/2012", 790, 192),
        line("3 DATA, LOCAL E UFDE NASCIMENTO", 450, 230), line("06/05/1990,CURITIBA,PR", 450, 252),
        line("4aDATAEMISSAO", 450, 285), line("11/10/2022", 450, 305),
        line("4bVALIDADE", 625, 285), line("17/03/2032", 625, 305),
        line("4CDOCIDENTIDADE/ORGEMISSOR/UF", 450, 340), line("130135951SESPPR", 450, 362),
        line("4dCPF", 450, 395), line("529.982.247-25", 450, 417),
        line("5NREGISTRO", 640, 395), line("07665700426", 640, 417),
        line("9CATHAB", 825, 395), line("B", 840, 417),
        line("NACIONALIDADE", 450, 450), line("BRASILEIRO(A)", 450, 472),
        line("FILIACAO", 450, 500), line("JOSE ALVES PEREIRA", 450, 524), line("MARIA APARECIDA SOUZA", 450, 586),
    ]  # fmt: skip


def back() -> list[TextLine]:
    return [
        line("12OBSERVACOES", 165, 270),
        line("EAR", 165, 292),
        line("LOCAL", 165, 495),
        line("CURITIBA,PR", 165, 517),
    ]


def mrz_texts(name: str = "ANA<<MARIA<SOUZA") -> list[str]:
    birth, expiration = "900506", "320317"
    line2 = (
        f"{birth}{mrz.check_digit(birth)}F{expiration}{mrz.check_digit(expiration)}BRA".ljust(
            29, "<"
        )
        + "0"
    )
    return ["I<BRA000000000<000".ljust(30, "<"), line2, name.ljust(30, "<")]


class FrontTests(unittest.TestCase):
    def test_reads_the_front_fields(self):
        fields = parse_digital(front())

        self.assertEqual(fields["name"], "ANAMARIASOUZA")  # sem espaços: a MRZ vai corrigir
        self.assertEqual(fields["cpf"], "52998224725")
        self.assertEqual(fields["cnh_number"], "07665700426")
        self.assertEqual(fields["rg"], "130135951")
        self.assertEqual(fields["category"], "B")
        self.assertEqual(fields["birth_date"], "1990-05-06")
        self.assertEqual(fields["birth_place"], "CURITIBA – PR")
        self.assertEqual(fields["issue_date"], "2022-10-11")
        self.assertEqual(fields["expiration_date"], "2032-03-17")
        self.assertEqual(fields["first_license_date"], "2012-10-03")
        self.assertEqual(fields["nationality"], "Brasileiro(a)")

    def test_filiation_is_father_then_mother_one_name_per_line(self):
        fields = parse_digital(front())

        self.assertEqual(fields["father_name"], "JOSE ALVES PEREIRA")
        self.assertEqual(fields["mother_name"], "MARIA APARECIDA SOUZA")

    def test_values_that_fail_validation_are_not_returned(self):
        broken = [
            line("529.982.247-26", item.points[0][0], item.points[0][1])
            if item.text.startswith("529")
            else item
            for item in front()
        ]

        self.assertNotIn("cpf", parse_digital(broken))

    def test_label_count_decides_if_the_image_is_this_layout(self):
        self.assertGreaterEqual(labels_found(front()), 5)
        self.assertLess(labels_found([line("QUALQUER TEXTO", 10, 10)]), 5)


class BackTests(unittest.TestCase):
    def test_reads_place_and_observations(self):
        fields = parse_digital(back())

        self.assertEqual(fields["issuing_state"], "PR")
        self.assertEqual(fields["issuing_authority"], "DETRAN-PR")
        self.assertEqual(fields["observations"], "EAR")


class MrzTests(unittest.TestCase):
    def test_mrz_restores_the_spaces_in_the_name(self):
        fields = parse_digital(front())

        apply_mrz(fields, mrz_texts())

        self.assertEqual(fields["name"], "ANA MARIA SOUZA")

    def test_mrz_does_not_replace_a_name_that_differs(self):
        fields = {"name": "OUTRA PESSOA"}

        apply_mrz(fields, mrz_texts())

        self.assertEqual(fields["name"], "OUTRA PESSOA")

    def test_mrz_dates_with_valid_check_digits_win(self):
        fields = {"birth_date": "1999-01-01"}  # leitura da frente divergente

        apply_mrz(fields, mrz_texts())

        self.assertEqual(fields["birth_date"], "1990-05-06")
        self.assertEqual(fields["expiration_date"], "2032-03-17")

    def test_without_a_mrz_nothing_changes(self):
        fields = {"name": "ANAMARIASOUZA"}

        apply_mrz(fields, ["texto", "qualquer"])

        self.assertEqual(fields, {"name": "ANAMARIASOUZA"})


class MergeTests(unittest.TestCase):
    def test_first_value_wins_and_parts_are_combined(self):
        self.assertEqual(merge([{"a": "1"}, {"a": "2", "b": "3"}]), {"a": "1", "b": "3"})


if __name__ == "__main__":
    unittest.main()
