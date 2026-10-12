"""Testes do script de inferência (`classify.py`) e do contrato JSON com o Django."""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import classify

from tests.test_rules import PLAUSIBLE

SCRIPT = Path(classify.__file__)
HAS_MODEL = classify.MODEL_PATH.exists()
CONTRACT_KEYS = {"is_suspicious", "confidence", "score", "reasons", "fields"}


def run_cli(stdin: str, **env) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT)],
        input=stdin,
        capture_output=True,
        text=True,
        env={**os.environ, **env},
        check=False,
    )


class ClassifyFunctionTests(unittest.TestCase):
    def test_missing_model_is_an_error_that_never_flags(self):
        with patch.object(classify, "MODEL_PATH", Path("/nonexistent/model.joblib")):
            result = classify.classify(PLAUSIBLE)

        self.assertFalse(result["is_suspicious"])
        self.assertIn("Modelo não encontrado", result["error"])
        self.assertTrue(set(result) >= CONTRACT_KEYS)

    def test_missing_reference_data_is_an_error_that_never_flags(self):
        with (
            patch.object(classify, "MODEL_PATH"),
            patch.object(classify, "reference_available", return_value=False),
        ):
            result = classify.classify(PLAUSIBLE)

        self.assertFalse(result["is_suspicious"])
        self.assertIn("Bases de referência", result["error"])

    def test_threshold_comes_from_the_environment(self):
        with patch.dict(os.environ, {"ML_PLAUSIBILITY_THRESHOLD": "0.9"}):
            self.assertEqual(classify._threshold(), 0.9)
        with patch.dict(os.environ, {"ML_PLAUSIBILITY_THRESHOLD": "abc"}):
            self.assertEqual(classify._threshold(), classify.THRESHOLD)


class ClassifyCliTests(unittest.TestCase):
    def test_invalid_stdin_is_a_usage_error(self):
        for stdin in ("", "não é json", "[1, 2]"):
            with self.subTest(stdin=stdin):
                completed = run_cli(stdin)
                self.assertEqual(completed.returncode, 1)
                self.assertIn("error", json.loads(completed.stdout))

    @unittest.skipUnless(HAS_MODEL, "modelo treinado não encontrado (rode train.py)")
    def test_plausible_record_with_the_real_model(self):
        completed = run_cli(json.dumps(PLAUSIBLE))

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(set(result) >= CONTRACT_KEYS)
        self.assertFalse(result["is_suspicious"], result)

    @unittest.skipUnless(HAS_MODEL, "modelo treinado não encontrado (rode train.py)")
    def test_junk_record_with_the_real_model(self):
        junk = {
            **PLAUSIBLE,
            "name": "Asdfghjkl",
            "mother_name": "Qwertyuiop",
            "cnh_number": "11111111111",
        }

        result = json.loads(run_cli(json.dumps(junk)).stdout)

        self.assertTrue(result["is_suspicious"])
        self.assertEqual(result["confidence"], "high")
        self.assertTrue(result["reasons"] and result["fields"])

    @unittest.skipUnless(HAS_MODEL, "modelo treinado não encontrado (rode train.py)")
    def test_accepts_non_ascii_json_and_returns_utf8(self):
        record = {**PLAUSIBLE, "name": "Wanderléia Müller", "mother_name": "Eurídice Müller"}

        completed = run_cli(json.dumps(record, ensure_ascii=False))

        self.assertEqual(completed.returncode, 0, completed.stderr)


if __name__ == "__main__":
    unittest.main()
