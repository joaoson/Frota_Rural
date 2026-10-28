"""Testes das bases de referência do IBGE (normalização, nomes e cidades)."""

import unittest
from pathlib import Path
from unittest.mock import patch

from lib import reference


class NormalizeTextTests(unittest.TestCase):
    def test_removes_accents_case_and_punctuation(self):
        self.assertEqual(reference.normalize_text("São Paulo"), "sao paulo")
        self.assertEqual(reference.normalize_text("Machadinho D'Oeste"), "machadinho d oeste")
        self.assertEqual(reference.normalize_text("Ji-Paraná"), "ji parana")
        self.assertEqual(reference.normalize_text("  JOSÉ   da  Silva "), "jose da silva")

    def test_empty_and_symbols_only(self):
        self.assertEqual(reference.normalize_text(""), "")
        self.assertEqual(reference.normalize_text("..--"), "")


class FirstNameTests(unittest.TestCase):
    def test_common_name_is_known_and_frequent(self):
        stats = reference.first_name_stats("Maria da Silva")
        self.assertTrue(stats.known)
        self.assertGreater(stats.log10_freq, 6)

    def test_accent_does_not_matter(self):
        self.assertEqual(reference.first_name_stats("José"), reference.first_name_stats("Jose"))

    def test_unknown_name_and_empty_text(self):
        self.assertEqual(reference.first_name_stats("Xkqptz"), (False, 0.0))
        self.assertEqual(reference.first_name_stats(""), (False, 0.0))

    def test_only_the_first_token_counts(self):
        self.assertEqual(
            reference.first_name_stats("Maria Xkqptz"), reference.first_name_stats("Maria")
        )


class CityMatchTests(unittest.TestCase):
    def test_exact_match_ignores_accents_and_case(self):
        for text in ("São Paulo", "sao paulo", "SAO PAULO"):
            with self.subTest(text):
                match = reference.city_match(text, "SP")
                self.assertTrue(match.exact_in_state)
                self.assertEqual(match.similarity_in_state, 1.0)

    def test_state_is_case_insensitive(self):
        self.assertTrue(reference.city_match("Campinas", "sp").exact_in_state)

    def test_typo_is_close_but_not_exact(self):
        match = reference.city_match("Ribeirão Pretto", "SP")
        self.assertFalse(match.exact_in_state)
        self.assertGreater(match.similarity_in_state, 0.9)

    def test_gibberish_is_far(self):
        match = reference.city_match("Xkqptz", "SP")
        self.assertFalse(match.exact_in_state)
        self.assertLess(match.similarity_in_state, 0.6)
        self.assertFalse(match.exists_in_other_state)

    def test_city_name_repeated_across_states_is_keyed_by_state(self):
        self.assertTrue(reference.city_match("Buritis", "RO").exact_in_state)
        self.assertTrue(reference.city_match("Buritis", "MG").exact_in_state)
        wrong = reference.city_match("Buritis", "SP")
        self.assertFalse(wrong.exact_in_state)
        self.assertTrue(wrong.exists_in_other_state)

    def test_federal_district_has_only_brasilia_in_the_ibge_table(self):
        # A DTB lista um único município (Brasília) para o DF. As Regiões Administrativas
        # (Taguatinga, Ceilândia...) não estão nela e não entram em lista extra.
        self.assertEqual(reference.cities()["DF"], frozenset({"brasilia"}))
        self.assertTrue(reference.city_match("Brasília", "DF").exact_in_state)
        self.assertFalse(reference.city_match("Taguatinga", "DF").exact_in_state)

    def test_places_that_are_not_municipalities_are_unknown(self):
        # Barão Geraldo é distrito de Campinas e Copacabana é bairro: nenhum é município.
        for place, state in (("Barão Geraldo", "SP"), ("Copacabana", "RJ")):
            with self.subTest(place):
                self.assertFalse(reference.city_match(place, state).exact_in_state)

    def test_empty_city(self):
        self.assertEqual(reference.city_match("", "SP"), (False, 0.0, False))


class MissingDataTests(unittest.TestCase):
    def test_missing_files_fail_open_to_empty_references(self):
        missing = Path("/nonexistent/file")
        reference.first_names.cache_clear()
        reference.cities.cache_clear()
        self.addCleanup(reference.first_names.cache_clear)
        self.addCleanup(reference.cities.cache_clear)
        with (
            patch.object(reference, "NAMES_PATH", missing),
            patch.object(reference, "CITIES_PATH", missing),
        ):
            self.assertFalse(reference.reference_available())
            self.assertEqual(reference.first_name_stats("Maria"), (False, 0.0))


if __name__ == "__main__":
    unittest.main()
