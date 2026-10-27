"""Testes das regras duras: cada regra dispara no caso certo e não em registro plausível."""

import copy
import unittest
from datetime import date

from lib.rules import evaluate_rules

TODAY = date(2026, 10, 12)

PLAUSIBLE = {
    "name": "José da Silva Santos",
    "birth_date": "1985-06-14",
    "cpf": "52998224725",
    "rg": "293847561",
    "mother_name": "Maria Aparecida Santos",
    "father_name": "Antônio Carlos da Silva",
    "nationality": "Brasileiro(a)",
    "birth_place": "São Paulo – SP",
    "cnh_number": "48213907563",
    "category": "B",
    "first_license_date": "2004-03-10",
    "issue_date": "2022-05-18",
    "expiration_date": "2032-05-18",
    "issuing_state": "SP",
    "issuing_authority": "DETRAN-SP",
    "situation": "active",
}


def codes(**overrides):
    record = {**copy.deepcopy(PLAUSIBLE), **overrides}
    return {hit.code for hit in evaluate_rules(record, today=TODAY)}


class RulesTests(unittest.TestCase):
    def test_plausible_record_has_no_hits(self):
        self.assertEqual(codes(), set())

    def test_formatted_numbers_are_accepted(self):
        self.assertEqual(codes(cpf="529.982.247-25", cnh_number="482.139.075-63"), set())

    def test_dates(self):
        self.assertIn("expiration_not_after_issue", codes(expiration_date="2022-05-18"))
        self.assertIn("expiration_not_after_issue", codes(expiration_date="2020-01-01"))
        self.assertIn("issue_before_first_license", codes(issue_date="2000-01-01"))
        self.assertIn("first_license_before_18", codes(first_license_date="2000-01-01"))
        self.assertIn("validity_too_long", codes(expiration_date="2052-05-18"))
        self.assertIn("birth_implausible", codes(birth_date="1850-01-01"))
        self.assertIn("birth_implausible", codes(birth_date="2015-01-01"))
        self.assertIn(
            "date_in_future", codes(issue_date="2030-01-01", expiration_date="2040-01-01")
        )
        self.assertIn("invalid_date", codes(issue_date="31/12/2022"))

    def test_validity_of_ten_years_is_allowed(self):
        self.assertNotIn(
            "validity_too_long", codes(issue_date="2022-05-18", expiration_date="2032-05-18")
        )

    def test_documents(self):
        self.assertIn("number_low_variety", codes(cnh_number="11111111111"))
        self.assertIn("number_low_variety", codes(cnh_number="12121212121"))
        self.assertIn("number_sequential", codes(cnh_number="12345678901"))
        self.assertIn("number_sequential", codes(cnh_number="98765432109"))
        self.assertIn("cnh_number_length", codes(cnh_number="123"))
        self.assertIn("rg_too_short", codes(rg="1"))

    def test_rgs_of_different_lengths_and_with_an_x_check_digit_are_not_flagged(self):
        # RG mais antigo (7 dígitos + verificador), RG atual (8 + verificador) e verificador "X"
        for rg in ("1.234.567-8", "12.345.678-9", "29.384.756-X", "2938475", "293847561"):
            with self.subTest(rg=rg):
                self.assertEqual(codes(rg=rg).intersection({"rg_too_short", "rg_invalid"}), set())
        self.assertIn("number_sequential", codes(rg="1234567"))
        self.assertIn("cpf_invalid", codes(cpf="52998224726"))  # dígito verificador errado
        self.assertIn("cpf_invalid", codes(cpf="11111111111"))
        self.assertIn("cpf_invalid", codes(cpf=""))

    def test_sequential_cpf_with_valid_check_digits_is_caught_as_a_pattern(self):
        hits = codes(cpf="12345678909")
        self.assertNotIn("cpf_invalid", hits)  # os dígitos verificadores batem
        self.assertIn("number_sequential", hits)

    def test_short_sequences_inside_real_numbers_are_not_hits(self):
        self.assertEqual(codes(cnh_number="48123490756", rg="293456781"), set())  # "1234", "3456"

    def test_names(self):
        self.assertIn("name_placeholder", codes(name="Teste Teste"))
        self.assertIn("name_placeholder", codes(mother_name="Fulana de Tal"))
        self.assertIn("name_has_digits", codes(name="Jose 2"))
        self.assertIn("name_repeated_chars", codes(name="Aaaaaa Silva"))
        self.assertIn("name_without_letters", codes(name="1234"))
        self.assertIn("name_equals_mother", codes(mother_name="jose da silva santos"))
        self.assertIn("parents_equal", codes(father_name="Maria Aparecida Santos"))

    def test_name_equal_to_the_fathers_is_allowed(self):
        self.assertEqual(codes(father_name="José da Silva Santos"), set())

    def test_keyboard_mash_and_vowelless_words(self):
        self.assertIn("name_keyboard_mash", codes(name="Asdfghjkl Silva"))
        self.assertIn("name_keyboard_mash", codes(mother_name="Poiuytre"))
        self.assertIn("name_no_vowels", codes(name="Xkqptz Silva"))
        self.assertIn("name_no_vowels", codes(father_name="Lkjhgf"))

    def test_city_gets_the_junk_text_checks_but_not_a_lookup(self):
        self.assertIn("name_keyboard_mash", codes(birth_place="Zxcvbn – SP"))
        self.assertIn("name_repeated_chars", codes(birth_place="Xxxxxx – SP"))
        self.assertIn("name_no_vowels", codes(birth_place="Xkqptz – SP"))
        # Distrito/bairro que não é município continua legítimo:
        for city in ("Barão Geraldo", "Copacabana", "Cidade Ocidental", "Ji-Paraná"):
            with self.subTest(city):
                self.assertEqual(codes(birth_place=f"{city} – SP"), set())

    def test_rare_but_real_names_are_not_hit(self):
        for name in (
            "Hiroshi Tanaka",
            "Wanderléia Albuquerque",
            "Dayane D'Ávila",
            "Ana Lima",
            "Lynn Dylan",
        ):
            with self.subTest(name):
                self.assertEqual(codes(name=name), set())

    def test_states(self):
        self.assertIn("birth_state_invalid", codes(birth_place="São Paulo – XX"))
        self.assertIn("issuing_state_invalid", codes(issuing_state="ZZ"))

    def test_missing_father_is_fine(self):
        self.assertEqual(codes(father_name=None), set())

    def test_hits_carry_group_and_message(self):
        hit = evaluate_rules({**PLAUSIBLE, "name": "Teste"}, today=TODAY)[0]
        self.assertEqual((hit.group, hit.code), ("name", "name_placeholder"))
        self.assertTrue(hit.message)


if __name__ == "__main__":
    unittest.main()
