"""Testes do gerador de dados sintéticos: determinismo, rótulos e coerência."""

import tempfile
import unittest
from datetime import date
from pathlib import Path

from lib import synthetic as synth_data
from lib.rules import evaluate_rules


class SynthDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.samples = synth_data.generate(300, 300, seed=5)

    def test_same_seed_gives_the_same_dataset(self):
        again = synth_data.generate(300, 300, seed=5)
        self.assertEqual([s.record for s in self.samples], [s.record for s in again])

    def test_different_seed_gives_a_different_dataset(self):
        other = synth_data.generate(300, 300, seed=6)
        self.assertNotEqual([s.record for s in self.samples], [s.record for s in other])

    def test_labels_and_families(self):
        positives = [s for s in self.samples if s.label == 0]
        negatives = [s for s in self.samples if s.label == 1]
        self.assertEqual((len(positives), len(negatives)), (300, 300))
        self.assertTrue(all(s.families == () for s in positives))
        self.assertTrue(all(1 <= len(s.families) <= 3 for s in negatives))

    def test_plausible_records_never_trip_a_hard_rule(self):
        for sample in self.samples:
            if sample.label == 0:
                hits = evaluate_rules(sample.record, today=date(2026, 10, 12))
                self.assertEqual(hits, [], sample.record)

    def test_plausible_dates_are_coherent(self):
        for sample in self.samples:
            if sample.label == 0:
                r = sample.record
                self.assertLess(r["birth_date"], r["first_license_date"])
                self.assertLessEqual(r["first_license_date"], r["issue_date"])
                self.assertLess(r["issue_date"], r["expiration_date"])

    def test_ambiguous_families_never_appear_alone(self):
        solo = {f.name for f in synth_data.FAMILIES if not f.standalone}
        for sample in self.samples:
            if sample.label == 1 and len(sample.families) == 1:
                self.assertNotIn(sample.families[0], solo)

    def test_csv_round_trip_is_lossless(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "records.csv"
            synth_data.write_csv(self.samples, path)

            loaded = synth_data.read_csv(path)

        self.assertEqual(len(loaded), len(self.samples))
        for original, back in zip(self.samples, loaded, strict=True):
            self.assertEqual(original, back)

    def test_csv_has_the_documented_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "records.csv"
            synth_data.write_csv(self.samples[:3], path)
            header = path.read_text(encoding="utf-8").splitlines()[0].split(",")

        self.assertEqual(tuple(header), synth_data.CSV_COLUMNS)
        self.assertEqual(header[-2:], ["label", "families"])

    def test_word_lists_come_from_the_lexicon_csv(self):
        self.assertTrue(synth_data.LEXICON_PATH.exists())
        self.assertIn("silva", synth_data.SURNAMES)
        self.assertIn("Teste", synth_data.PLACEHOLDER_NAMES)
        self.assertFalse(hasattr(synth_data, "DISTRICTS"))  # distritos vêm da lista do IBGE

    def test_some_plausible_people_are_born_in_real_districts(self):
        from lib import reference

        in_district = 0
        for sample in self.samples:
            if sample.label == 0 and sample.record["nationality"] == "Brasileiro(a)":
                city, state = sample.record["birth_place"].rsplit(" – ", 1)
                if reference.normalize_text(city) in reference.districts().get(state, ()):
                    in_district += 1
        self.assertGreater(in_district, 5)

    def test_document_number_helpers(self):
        import random

        rng = random.Random(1)
        for _ in range(200):
            number = synth_data._clean_digits(rng, 11)
            self.assertEqual(len(number), 11)
            self.assertLessEqual(synth_data._max_sequence(number), 3)
        self.assertEqual(len(synth_data._sequential_number(rng, 11)), 11)
        self.assertEqual(synth_data._cpf_from("123456789"), "12345678909")


if __name__ == "__main__":
    unittest.main()
