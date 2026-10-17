"""Testes da comparação entre o cadastro digitado e o OCR da foto."""

import unittest

from lib.consistency import ABSENT, MATCH, MISMATCH, compare

from tests.test_rules import PLAUSIBLE

OCR_FIELDS = {
    "cpf": "52998224725",
    "cnh_number": "48213907563",
    "birth_date": "1985-06-14",
    "first_license_date": "2004-03-10",
    "issue_date": "2022-05-18",
    "expiration_date": "2032-05-18",
    "issuing_state": "SP",
}


def ocr(uncertain=(), **overrides):
    return {"fields": {**OCR_FIELDS, **overrides}, "uncertain_fields": list(uncertain)}


class CompareTests(unittest.TestCase):
    def test_everything_matches(self):
        result = compare(PLAUSIBLE, ocr())

        self.assertEqual(result.mismatched, [])
        self.assertEqual(result.status["cpf"], MATCH)
        self.assertEqual(result.agreement, 1.0)
        self.assertEqual(result.evidence, 6.5)  # 6 campos fortes + UF (0,5)
        self.assertFalse(result.hard_mismatch)

    def test_formatted_numbers_and_case_do_not_matter(self):
        record = {**PLAUSIBLE, "cpf": "529.982.247-25", "issuing_state": "sp"}

        self.assertEqual(compare(record, ocr()).mismatched, [])

    def test_rg_comparison_keeps_the_x_check_digit_and_any_length(self):
        same = compare({**PLAUSIBLE, "rg": "12.345.678-X"}, ocr(rg="12345678X"))
        older = compare({**PLAUSIBLE, "rg": "1.234.567-8"}, ocr(rg="12345678"))
        other_check = compare({**PLAUSIBLE, "rg": "12.345.678-9"}, ocr(rg="12345678X"))

        self.assertEqual(same.status["rg"], MATCH)
        self.assertEqual(older.status["rg"], MATCH)
        self.assertEqual(other_check.status["rg"], MISMATCH)

    def test_no_ocr_compares_nothing(self):
        for source in (None, {}, {"fields": None, "uncertain_fields": []}):
            with self.subTest(source=source):
                result = compare(PLAUSIBLE, source)
                self.assertEqual(set(result.status.values()), {ABSENT})
                self.assertEqual(result.evidence, 0)
                self.assertEqual(result.agreement, 1.0)

    def test_cpf_mismatch_is_hard(self):
        result = compare(PLAUSIBLE, ocr(cpf="11144477735"))

        self.assertEqual(result.mismatched, ["cpf"])
        self.assertTrue(result.hard_mismatch)
        self.assertEqual(result.groups, ["documents"])

    def test_two_strong_mismatches_are_hard_but_one_is_not(self):
        one = compare(PLAUSIBLE, ocr(issue_date="2021-01-01"))
        two = compare(PLAUSIBLE, ocr(issue_date="2021-01-01", cnh_number="00000000001"))

        self.assertEqual(one.mismatched, ["issue_date"])
        self.assertFalse(one.hard_mismatch)
        self.assertTrue(two.hard_mismatch)
        self.assertEqual(two.groups, ["documents", "dates"])

    def test_medium_mismatch_is_never_hard(self):
        result = compare(PLAUSIBLE, ocr(issuing_state="MG"))

        self.assertEqual(result.mismatched, ["issuing_state"])
        self.assertFalse(result.hard_mismatch)

    def test_uncertain_fields_are_ignored(self):
        confident = compare(PLAUSIBLE, ocr(name="Maria Souza"))
        flagged = compare(PLAUSIBLE, ocr(uncertain=["name"], name="Maria Souza"))

        self.assertEqual(confident.status["name"], MISMATCH)
        self.assertEqual(flagged.status["name"], ABSENT)

    def test_name_tolerates_an_ocr_typo_and_accents(self):
        self.assertEqual(compare(PLAUSIBLE, ocr(name="JOSE DA SILVA SANTOS")).status["name"], MATCH)
        self.assertEqual(compare(PLAUSIBLE, ocr(name="JOSE DA SILVA SANTAS")).status["name"], MATCH)

    def test_parents_match_in_either_order(self):
        swapped = compare(
            PLAUSIBLE,
            ocr(mother_name="ANTONIO CARLOS DA SILVA", father_name="MARIA APARECIDA SANTOS"),
        )
        wrong = compare(PLAUSIBLE, ocr(mother_name="JOANA PEREIRA LIMA"))

        self.assertEqual(swapped.status["mother_name"], MATCH)
        self.assertEqual(swapped.status["father_name"], MATCH)
        self.assertEqual(wrong.status["mother_name"], MISMATCH)

    def test_birth_place_compares_city_and_state(self):
        same = compare(PLAUSIBLE, ocr(birth_place="SAO PAULO – SP"))
        other_state = compare(PLAUSIBLE, ocr(birth_place="São Paulo – MG"))

        self.assertEqual(same.status["birth_place"], MATCH)
        self.assertEqual(other_state.status["birth_place"], MISMATCH)

    def test_empty_form_fields_are_absent(self):
        record = {**PLAUSIBLE, "cpf": "", "father_name": None}

        result = compare(record, ocr(father_name="ANTONIO CARLOS DA SILVA"))

        self.assertEqual(result.status["cpf"], ABSENT)
        self.assertEqual(result.status["father_name"], ABSENT)

    def test_unparseable_dates_are_absent_not_a_mismatch(self):
        result = compare({**PLAUSIBLE, "issue_date": "ontem"}, ocr())

        self.assertEqual(result.status["issue_date"], ABSENT)

    def test_weak_mismatch_lowers_agreement_only_a_little(self):
        result = compare(PLAUSIBLE, ocr(mother_name="JOANA PEREIRA LIMA"))

        self.assertAlmostEqual(result.agreement, 6.5 / 6.75)


if __name__ == "__main__":
    unittest.main()
