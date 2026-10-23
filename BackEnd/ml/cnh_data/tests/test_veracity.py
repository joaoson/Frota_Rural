"""Testes da combinação plausibilidade + consistência (índice de veracidade)."""

import unittest

from lib.consistency import ABSENT, FIELDS, MATCH, MISMATCH, Consistency
from lib.veracity import BASIS_OCR, BASIS_PLAUSIBILITY, combine

THRESHOLD = 0.60


def consistency(**status):
    return Consistency({name: status.get(name, ABSENT) for name in FIELDS})


STRONG_MATCH = consistency(cpf=MATCH, cnh_number=MATCH, birth_date=MATCH, issue_date=MATCH)


class CombineTests(unittest.TestCase):
    def test_without_ocr_the_index_is_exactly_the_plausibility(self):
        for model_fake in (0.0, 0.3, 0.9):
            with self.subTest(model_fake=model_fake):
                verdict = combine(model_fake, consistency(), THRESHOLD, rule_hit=False)

                self.assertEqual(verdict.basis, BASIS_PLAUSIBILITY)
                self.assertEqual(verdict.veracity, round(100 * (1 - model_fake)))
                self.assertEqual(verdict.is_suspicious, model_fake >= THRESHOLD)

    def test_little_ocr_evidence_is_ignored(self):
        weak = consistency(issuing_state=MISMATCH, category=MATCH)  # 1,0 de evidência

        self.assertEqual(combine(0.2, weak, THRESHOLD, rule_hit=False).basis, BASIS_OCR)
        only_state = consistency(issuing_state=MISMATCH)  # 0,5 < MIN_EVIDENCE
        verdict = combine(0.2, only_state, THRESHOLD, rule_hit=False)
        self.assertEqual(verdict.basis, BASIS_PLAUSIBILITY)
        self.assertEqual(verdict.veracity, 80)

    def test_strong_agreement_overrides_a_suspicious_model(self):
        verdict = combine(0.8, STRONG_MATCH, THRESHOLD, rule_hit=False)

        self.assertEqual(verdict.basis, BASIS_OCR)
        self.assertFalse(verdict.is_suspicious)
        self.assertEqual(verdict.veracity, 100)

    def test_partial_evidence_blends_both_sources(self):
        two = consistency(cpf=MATCH, birth_date=MATCH)  # evidência 2,0 → peso 2/3

        verdict = combine(0.9, two, THRESHOLD, rule_hit=False)

        self.assertAlmostEqual(verdict.fake_score, 0.3)
        self.assertFalse(verdict.is_suspicious)

    def test_cpf_mismatch_refuses_even_if_the_model_likes_the_data(self):
        verdict = combine(
            0.0, consistency(cpf=MISMATCH, birth_date=MATCH), THRESHOLD, rule_hit=False
        )

        self.assertTrue(verdict.is_suspicious)
        self.assertTrue(verdict.hard_mismatch)
        self.assertGreaterEqual(verdict.fake_score, 0.95)
        self.assertLessEqual(verdict.veracity, 5)

    def test_one_soft_strong_mismatch_does_not_refuse_alone(self):
        status = consistency(cpf=MATCH, cnh_number=MATCH, birth_date=MATCH, issue_date=MISMATCH)

        verdict = combine(0.1, status, THRESHOLD, rule_hit=False)

        self.assertFalse(verdict.hard_mismatch)
        self.assertFalse(verdict.is_suspicious)

    def test_hard_rule_wins_over_a_perfect_match(self):
        verdict = combine(0.0, STRONG_MATCH, THRESHOLD, rule_hit=True)

        self.assertTrue(verdict.is_suspicious)
        self.assertEqual(verdict.veracity, 0)

    def test_mismatch_below_the_evidence_floor_is_not_hard(self):
        verdict = combine(0.1, consistency(issuing_state=MISMATCH), THRESHOLD, rule_hit=False)

        self.assertFalse(verdict.hard_mismatch)

    def test_high_threshold_never_refuses_without_a_hard_signal(self):
        self.assertFalse(combine(0.99, consistency(), 1.01, rule_hit=False).is_suspicious)


if __name__ == "__main__":
    unittest.main()
