"""Leitor: decide o tipo de layout a partir do OCR (simulado) e promove ou não o documento."""

import unittest
from unittest.mock import patch

import numpy as np
from lib import reader
from lib.reader import DIGITAL, OLD, UNKNOWN, Reading, read_document

from tests.test_parse_antiga import confirming_reads, document
from tests.test_parse_digital import back, front, line, mrz_texts

IMAGE = np.zeros((10, 10, 3), dtype=np.uint8)


def read(images: list, lines_per_image: list, reads: int = 3) -> Reading:
    with (
        patch("lib.reader.source.load_images", return_value=images),
        patch("lib.reader.ocr.read_lines", side_effect=lines_per_image),
        confirming_reads(reads),
    ):
        return read_document("qualquer.jpg")


class ReadDocumentTests(unittest.TestCase):
    def test_old_layout(self):
        reading = read([IMAGE], [document()])

        self.assertEqual(reading.document_type, OLD)
        self.assertEqual(reading.fields["cpf"], "52998224725")
        self.assertTrue(reading.promotes)

    def test_digital_layout_from_the_images_of_a_pdf(self):
        mrz_lines = [line(text, 185, 400 + 50 * i, 500) for i, text in enumerate(mrz_texts())]

        reading = read([IMAGE] * 3, [front(), back(), mrz_lines])

        self.assertEqual(reading.document_type, DIGITAL)
        self.assertEqual(reading.fields["name"], "ANA MARIA SOUZA")  # espaços vindos da MRZ
        self.assertEqual(reading.fields["birth_place"], "CURITIBA – PR")
        self.assertEqual(reading.fields["issuing_state"], "PR")
        self.assertTrue(reading.promotes)

    def test_unknown_layout_has_no_fields_and_does_not_promote(self):
        reading = read([IMAGE], [[line("texto qualquer", 10, 10), line("outra coisa", 10, 40)]])

        self.assertEqual(reading.document_type, UNKNOWN)
        self.assertEqual(reading.fields, {})
        self.assertFalse(reading.promotes)

    def test_no_text_at_all(self):
        self.assertEqual(read([IMAGE], [[]]).document_type, UNKNOWN)

    def test_ear_in_the_observations_becomes_a_flag(self):
        reading = read([IMAGE] * 2, [front(), back()])

        self.assertEqual(reading.fields["observations"], "EAR")
        self.assertEqual(reading.fields["ear"], "true")

    def test_uncertain_fields_are_kept_only_if_they_were_returned(self):
        reading = Reading(OLD, {"cpf": "1"}, ["name", "cpf"])

        reader._finish(reading)

        self.assertEqual(reading.uncertain, ["cpf"])


class PromotionTests(unittest.TestCase):
    def test_needs_a_known_layout_and_enough_fields(self):
        many = dict.fromkeys("abcd", "x")

        self.assertTrue(Reading(OLD, many).promotes)
        self.assertFalse(Reading(OLD, {"a": "x", "b": "y"}).promotes)
        self.assertFalse(Reading(UNKNOWN, many).promotes)


if __name__ == "__main__":
    unittest.main()
