"""Testes do modelo e da decisão final, com um modelo pequeno treinado na hora."""

import tempfile
import unittest
from datetime import date
from pathlib import Path

import numpy as np
from lib import synthetic
from lib.features import feature_vector
from lib.model import THRESHOLD, PlausibilityModel, assess

from tests.test_rules import PLAUSIBLE

TODAY = date(2026, 10, 12)
# Lixo que nenhuma regra dura reconhece (palavras comuns no lugar dos nomes): só o ML pega.
WORD_JUNK = {
    **PLAUSIBLE,
    "name": "Banana Azul",
    "mother_name": "Casa Verde",
    "father_name": "Sapato Preto",
}


class PlausibilityModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        samples = synthetic.generate(700, 600, seed=21)
        cls.matrix = np.asarray([feature_vector(s.record) for s in samples], dtype=float)
        cls.labels = np.asarray([s.label for s in samples])
        cls.model = PlausibilityModel.fit(cls.matrix, cls.labels)

    def test_scores_are_probabilities_and_separate_the_classes(self):
        scores = self.model.score_matrix(self.matrix)

        self.assertEqual(scores.shape, (len(self.labels),))
        self.assertTrue(((scores >= 0) & (scores <= 1)).all())
        self.assertGreater(scores[self.labels == 1].mean(), scores[self.labels == 0].mean() + 0.5)

    def test_save_and_load_give_the_same_scores(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "model.joblib"
            self.model.save(path)
            loaded = PlausibilityModel.load(path)

        np.testing.assert_allclose(
            loaded.score_matrix(self.matrix[:50]), self.model.score_matrix(self.matrix[:50])
        )

    def test_load_rejects_a_model_trained_with_other_features(self):
        import joblib

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "old.joblib"
            self.model.save(path)
            payload = joblib.load(path)
            payload["feature_names"] = payload["feature_names"][:-1]
            joblib.dump(payload, path)

            with self.assertRaisesRegex(ValueError, "retreine"):
                PlausibilityModel.load(path)

    def test_explain_points_at_the_group_that_makes_it_suspicious(self):
        record = {**PLAUSIBLE, "name": "Xkqpt Zrvbn", "mother_name": "Lkjhgf Mnbvc"}

        groups = self.model.explain(record)

        self.assertTrue(set(groups) & {"name", "mother_name"}, groups)


class _FakeModel(PlausibilityModel):
    """Notas fixas, para testar a regra do local de nascimento sem depender de treino."""

    def __init__(self):
        pass

    def score_matrix(self, matrix):
        return np.array([0.9, 0.9, 0.3])

    def score_without_place(self, matrix):
        return np.array([0.05, 0.5, 0.9])


class PlaceAloneTests(unittest.TestCase):
    def test_birth_place_alone_never_flags(self):
        flags = _FakeModel().flags(np.zeros((3, 1)), 0.6)

        # 1ª: nota alta, mas sem o local cai a 0,05  -> só o local puxava: NÃO recusa
        # 2ª: nota alta e sem o local ainda 0,5      -> há outra evidência: recusa
        # 3ª: nota 0,3 abaixo do limiar              -> não recusa (mesmo sem o local sendo alto)
        self.assertEqual(flags.tolist(), [False, True, False])


class AssessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        samples = synthetic.generate(700, 600, seed=22)
        matrix = np.asarray([feature_vector(s.record) for s in samples], dtype=float)
        cls.model = PlausibilityModel.fit(matrix, np.asarray([s.label for s in samples]))

    def test_plausible_record_is_released(self):
        result = assess(PLAUSIBLE, self.model, THRESHOLD, TODAY)

        self.assertFalse(result["is_suspicious"])
        self.assertEqual((result["reasons"], result["fields"]), ([], []))

    def test_hard_rule_makes_it_suspicious_with_certainty(self):
        result = assess({**PLAUSIBLE, "name": "Teste Teste"}, self.model, THRESHOLD, TODAY)

        self.assertTrue(result["is_suspicious"])
        self.assertEqual(result["score"], 1.0)
        self.assertIn("nome", result["fields"])
        self.assertTrue(result["reasons"])

    def test_model_alone_can_flag_junk_without_any_rule(self):
        junk = WORD_JUNK

        result = assess(junk, self.model, THRESHOLD, TODAY)

        self.assertTrue(result["is_suspicious"])
        self.assertEqual(result["reasons"], [])  # nenhuma regra: foi o modelo
        self.assertTrue(result["fields"])

    def test_unknown_birth_place_alone_is_not_enough_to_refuse(self):
        record = {**PLAUSIBLE, "birth_place": "Zorbaldo do Norte – SP"}  # não está em nenhuma lista

        result = assess(record, self.model, THRESHOLD, TODAY)

        self.assertFalse(result["is_suspicious"], result)
        self.assertEqual(result["fields"], [])
        self.assertLess(result["score"], THRESHOLD)  # a nota reportada é a que decidiu

    def test_unknown_birth_place_still_counts_when_there_is_other_evidence(self):
        record = {**WORD_JUNK, "birth_place": "Zorbaldo do Norte – SP"}

        result = assess(record, self.model, THRESHOLD, TODAY)

        self.assertTrue(result["is_suspicious"], result)

    def test_threshold_controls_the_decision(self):
        junk = WORD_JUNK

        self.assertFalse(assess(junk, self.model, 1.01, TODAY)["is_suspicious"])
        self.assertTrue(assess(junk, self.model, 0.0, TODAY)["is_suspicious"])


if __name__ == "__main__":
    unittest.main()
