"""Leitura do ground truth do dataset BID e a verdade dos campos (só para aprender e medir)."""

import tempfile
import unittest
from pathlib import Path

from lib.groundtruth import GtLine, document_key, is_validation, read_gt, truth_fields, truth_lines

HEADER = "x, y, width, height, transcription"


def gt(x: float, y: float, text: str, length: float = 100.0, thickness: float = 10.0) -> GtLine:
    return GtLine(text, (x, y), length, thickness)


class ReadGtTests(unittest.TestCase):
    def test_reads_latin1_and_skips_polygons(self):
        content = (
            f"{HEADER}\n"
            "[117, 118, 625, 623], [22, 45, 41, 19], -1, -1, REP\xdaBLICA FEDERATIVA\n"
            "109, 104, 37, 12, NOME\n"
            "104, 120, 177, 9, JOS\xc9 DA SILVA\n"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "x_gt_ocr.txt"
            path.write_bytes(content.encode("latin-1"))

            lines = read_gt(path)

        self.assertEqual([line.text for line in lines], ["NOME", "JOSÉ DA SILVA"])
        self.assertEqual(lines[1].center, (104 + 177 / 2, 120 + 9 / 2))
        self.assertEqual((lines[1].length, lines[1].thickness), (177.0, 9.0))  # lado maior e menor

    def test_document_key_ignores_order(self):
        a = [gt(0, 0, "B"), gt(1, 1, "A")]
        b = [gt(5, 5, "A"), gt(9, 9, "B")]

        self.assertEqual(document_key(a), document_key(b))


class SplitTests(unittest.TestCase):
    def test_is_deterministic_and_close_to_the_target_share(self):
        keys = [(f"documento {i}", "x") for i in range(2000)]

        flags = [is_validation(key) for key in keys]

        self.assertEqual(flags, [is_validation(key) for key in keys])
        self.assertTrue(0.20 < sum(flags) / len(flags) < 0.30)


class TruthTests(unittest.TestCase):
    def lines(self) -> list[GtLine]:
        return [
            gt(100, 100, "NOME"), gt(105, 120, "MARIA SILVA"),
            gt(300, 100, "CPF"), gt(305, 120, "529.982.247-25"),
            gt(300, 200, "DATA NASCIMENTO"), gt(305, 220, "14/05/1996"),
            gt(100, 300, "VALIDADE"), gt(105, 320, "20/02/2030"),
            gt(300, 300, "1ª HABILITAÇÃO"), gt(305, 320, "27/09/2016"),
            gt(500, 300, "DATA EMISSÃO"), gt(505, 320, "17/06/2020"),
            gt(100, 400, "Nº REGISTRO"), gt(105, 420, "07665700426"),
            gt(500, 400, "CAT. HAB."), gt(505, 420, "B"),
            gt(100, 500, "LOCAL"), gt(105, 520, "CLAUDIO-MG"),
            gt(500, 700, "38942188160"),  # outro número de 11 dígitos, longe do rótulo
        ]  # fmt: skip

    def test_each_value_is_the_line_nearest_to_its_label(self):
        truth = truth_fields(self.lines())

        self.assertEqual(truth["name"], "MARIA SILVA")
        self.assertEqual(truth["cpf"], "52998224725")
        self.assertEqual(truth["birth_date"], "1996-05-14")
        self.assertEqual(truth["expiration_date"], "2030-02-20")
        self.assertEqual(truth["first_license_date"], "2016-09-27")
        self.assertEqual(truth["issue_date"], "2020-06-17")
        self.assertEqual(truth["cnh_number"], "07665700426")
        self.assertEqual(truth["category"], "B")
        self.assertEqual(truth["issuing_state"], "MG")

    def test_truth_lines_expose_the_geometry(self):
        found = truth_lines(self.lines())

        self.assertEqual(found["cpf"].center, (305, 120))

    def test_dates_are_paired_with_distinct_labels(self):
        truth = truth_fields(self.lines())

        dates = [
            truth[k] for k in ("birth_date", "expiration_date", "first_license_date", "issue_date")
        ]
        self.assertEqual(len(set(dates)), 4)


if __name__ == "__main__":
    unittest.main()
