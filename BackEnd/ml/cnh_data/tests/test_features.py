"""Testes da extração de features."""

import math
import unittest

from lib.features import (
    FEATURE_GROUPS,
    FEATURE_NAMES,
    extract_features,
    feature_vector,
    text_stats,
)
from lib.record import longest_digit_sequence, longest_same_run

from tests.test_rules import PLAUSIBLE


def nan(value):
    return isinstance(value, float) and math.isnan(value)


class ExtractFeaturesTests(unittest.TestCase):
    def test_vector_matches_feature_names_for_any_record(self):
        for record in ({}, PLAUSIBLE, {"name": None, "points": "abc", "birth_date": "xx"}):
            with self.subTest(record=record):
                self.assertEqual(len(feature_vector(record)), len(FEATURE_NAMES))

    def test_every_feature_belongs_to_a_known_group(self):
        groups = set(FEATURE_GROUPS.values())
        self.assertEqual(
            groups,
            {
                "name",
                "mother_name",
                "father_name",
                "birth_place",
                "dates",
                "documents",
                "license",
                "notes",
            },
        )

    def test_missing_optional_fields_are_nan(self):
        values = extract_features({**PLAUSIBLE, "father_name": None})
        self.assertEqual(values["father_present"], 0.0)
        self.assertTrue(nan(values["father_len"]))
        self.assertTrue(nan(values["notes_obs_len"]))

    def test_plausible_record_is_clean(self):
        values = extract_features(PLAUSIBLE)
        self.assertEqual(values["name_first_known"], 1.0)
        self.assertEqual(values["local_city_exact"], 1.0)
        self.assertEqual(values["doc_cpf_valid"], 1.0)
        self.assertEqual(values["date_all_valid"], 1.0)
        self.assertAlmostEqual(values["date_validity_years"], 10.0, delta=0.05)

    def test_foreigner_has_neutral_city_features(self):
        values = extract_features(
            {**PLAUSIBLE, "nationality": "Estrangeiro(a)", "birth_place": "Lisboa – SP"}
        )
        self.assertTrue(nan(values["local_city_exact"]))
        self.assertEqual(values["license_foreign"], 1.0)

    def test_city_outside_the_state(self):
        values = extract_features({**PLAUSIBLE, "birth_place": "Curitiba – SP"})
        self.assertEqual(values["local_city_exact"], 0.0)
        self.assertEqual(values["local_city_elsewhere"], 1.0)

    def test_birth_city_and_state_fields_override_birth_place(self):
        values = extract_features(
            {**PLAUSIBLE, "birth_place": "x", "birth_city": "Curitiba", "birth_state": "PR"}
        )
        self.assertEqual(values["local_city_exact"], 1.0)

    def test_authority_state_match(self):
        self.assertEqual(extract_features(PLAUSIBLE)["license_authority_state_match"], 1.0)
        mismatch = extract_features({**PLAUSIBLE, "issuing_authority": "DETRAN-RJ"})
        self.assertEqual(mismatch["license_authority_state_match"], 0.0)
        no_state = extract_features({**PLAUSIBLE, "issuing_authority": "DETRAN"})
        self.assertTrue(nan(no_state["license_authority_state_match"]))


class TextStatsTests(unittest.TestCase):
    def test_keyboard_and_repetition_patterns(self):
        mash = text_stats("asdfghjkl", "t")
        self.assertGreaterEqual(mash["t_keyboard_run"], 8)
        self.assertGreaterEqual(text_stats("jkjkjk", "t")["t_period_run"], 6)
        self.assertEqual(text_stats("aaaaaa", "t")["t_max_run"], 6)

    def test_real_name_scores_better_than_gibberish_in_the_language_model(self):
        real = text_stats("Joaquim Fernandes", "t")
        junk = text_stats("Xkqpt Zrvbn", "t")
        self.assertGreater(real["t_lm_mean"], junk["t_lm_mean"])
        self.assertGreater(real["t_lm_min"], junk["t_lm_min"])
        self.assertLess(junk["t_vowel_ratio"], 0.1)

    def test_digits_and_symbols(self):
        values = text_stats("Jose 12 @@", "t")
        self.assertGreater(values["t_digit_ratio"], 0)
        self.assertGreater(values["t_symbol_ratio"], 0)

    def test_person_fields_include_first_name_frequency(self):
        values = text_stats("Maria Silva", "t", person=True)
        self.assertEqual(values["t_first_known"], 1.0)
        self.assertGreater(values["t_first_log10_freq"], 6)
        self.assertNotIn("t_first_known", text_stats("Maria Silva", "t"))

    def test_empty_text_is_all_nan(self):
        self.assertTrue(all(nan(value) for value in text_stats("", "t", person=True).values()))


class DigitPatternTests(unittest.TestCase):
    def test_sequential_digits(self):
        self.assertEqual(longest_digit_sequence("12345678901"), 9)
        self.assertEqual(longest_digit_sequence("98765432100"), 10)
        self.assertEqual(longest_digit_sequence("98765"), 5)
        self.assertEqual(longest_digit_sequence("48213907563"), 2)
        self.assertEqual(longest_digit_sequence(""), 0)

    def test_longest_same(self):
        self.assertEqual(longest_same_run("11122"), 3)
        self.assertEqual(longest_same_run(""), 0)


if __name__ == "__main__":
    unittest.main()
