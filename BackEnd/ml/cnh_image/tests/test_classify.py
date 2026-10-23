"""`classify.py`: junta a rede neural e o OCR. A rede e o leitor são simulados (sem TF real)."""

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import classify
from lib.reader import DIGITAL, OLD, UNKNOWN, Reading

CNN_OK = {"is_valid": True, "confidence": "high", "score": 0.97}
CNN_NO = {"is_valid": False, "confidence": "low", "score": 0.35}
MANY = {"name": "X", "cpf": "1", "rg": "2", "category": "B"}


def run(
    cnn: dict, reading: Reading | Exception, path: str = "a.jpg", env: dict | None = None
) -> dict:
    target = "lib.reader.read_document"
    patched = (
        patch(target, side_effect=reading)
        if isinstance(reading, Exception)
        else patch(target, return_value=reading)
    )
    with (
        patch.object(classify, "classify_image", return_value=dict(cnn)),
        patched,
        patch.dict(os.environ, env or {}),
    ):
        return classify.classify(path)


class ClassifyTests(unittest.TestCase):
    def test_contract_keys(self):
        result = run(CNN_OK, Reading(OLD, dict(MANY), ["name"]))

        self.assertEqual(
            set(result),
            {"is_valid", "confidence", "score", "document_type", "fields", "uncertain_fields"},
        )
        self.assertEqual(result["document_type"], OLD)
        self.assertEqual(result["uncertain_fields"], ["name"])
        self.assertEqual(result["score"], 0.97)  # a nota é sempre da rede neural

    def test_the_network_approves_and_the_ocr_finds_nothing(self):
        result = run(CNN_OK, Reading())

        self.assertTrue(result["is_valid"])
        self.assertEqual((result["document_type"], result["fields"]), (UNKNOWN, None))

    def test_the_ocr_promotes_a_document_the_network_rejects(self):
        result = run(CNN_NO, Reading(DIGITAL, dict(MANY)), path="cnh.pdf")

        self.assertTrue(result["is_valid"])
        self.assertEqual(result["confidence"], "medium")
        self.assertEqual(result["score"], 0.35)  # a nota baixa da rede continua visível

    def test_the_ocr_does_not_promote_with_too_few_fields(self):
        result = run(CNN_NO, Reading(OLD, {"cpf": "1"}), path="cnh.pdf")

        self.assertFalse(result["is_valid"])

    def test_a_clearly_not_a_cnh_image_skips_the_ocr(self):
        with (
            patch("lib.reader.read_document") as reader_mock,
            patch.object(
                classify,
                "classify_image",
                return_value={"is_valid": False, "confidence": "low", "score": 0.01},
            ),
        ):
            result = classify.classify("foto.jpg")

        reader_mock.assert_not_called()
        self.assertEqual(result["document_type"], UNKNOWN)

    def test_a_pdf_always_goes_through_the_ocr_even_with_a_low_score(self):
        result = run(
            {"is_valid": False, "confidence": "low", "score": 0.01},
            Reading(DIGITAL, dict(MANY)),
            "cnh.pdf",
        )

        self.assertTrue(result["is_valid"])

    def test_an_ocr_failure_never_breaks_the_validation(self):
        result = run(CNN_OK, RuntimeError("onnx quebrou"))

        self.assertTrue(result["is_valid"])
        self.assertEqual((result["document_type"], result["fields"]), (UNKNOWN, None))

    def test_ocr_can_be_turned_off(self):
        result = run(CNN_NO, Reading(DIGITAL, dict(MANY)), "cnh.pdf", env={"CNH_OCR": "0"})

        self.assertFalse(result["is_valid"])
        self.assertIsNone(result["fields"])

    def test_ear_is_a_boolean_in_the_json(self):
        result = run(CNN_OK, Reading(OLD, {**MANY, "ear": "true"}))

        self.assertIs(result["fields"]["ear"], True)

    def test_a_missing_model_is_reported_without_fields(self):
        error = {"is_valid": False, "confidence": "low", "score": 0.0, "error": "sem modelo"}

        result = run(error, Reading(OLD, dict(MANY)))

        self.assertEqual(result["error"], "sem modelo")
        self.assertIsNone(result["fields"])

    def test_field_values_never_reach_stderr(self):
        with patch("sys.stderr") as stderr:
            run(CNN_OK, RuntimeError("falha com o cpf 52998224725"))

        written = "".join(str(call.args[0]) for call in stderr.write.call_args_list)
        self.assertNotIn("52998224725", written)


class CliTests(unittest.TestCase):
    def test_without_arguments_it_is_a_usage_error(self):
        script = Path(classify.__file__)

        completed = subprocess.run(
            [sys.executable, str(script)], capture_output=True, text=True, check=False
        )

        self.assertEqual(completed.returncode, 1)
        self.assertIn("error", json.loads(completed.stdout))


if __name__ == "__main__":
    unittest.main()
