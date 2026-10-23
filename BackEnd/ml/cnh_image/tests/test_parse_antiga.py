"""Parser da CNH antiga, testado com linhas de OCR simuladas a partir do próprio template.

Cada valor é posto onde o template diz que ele fica, e o documento inteiro é girado/ampliado
como numa foto. Assim o teste cobre o registro por âncoras e as janelas sem depender do motor
de OCR nem de nenhuma imagem do dataset. Todos os dados são inventados.
"""

import unittest
from unittest.mock import patch

import numpy as np
from lib.layouts import OLD_LABELS
from lib.ocr import TextLine
from lib.parse_antiga import _join_parents, _Reader, load_template, parse_old

# Textos de cada rótulo como o OCR costuma devolver (sem espaços, com pequenos erros).
LABEL_TEXT = dict(OLD_LABELS)
VALUES = {
    "name": "MARIA APARECIDA SILVA",
    "cpf": "529.982.247-25",
    "doc": "732213587",
    "birth": "14/05/1996",
    "category": "AB",
    "register": "07665700426",
    "expiration": "20/02/2030",
    "first_license": "27/09/2016",
    "issue": "17/06/2020",
    "place": "CLAUDIO-MG",
}


def make_line(
    text: str, center: tuple[float, float], length: float, angle: float, scale: float
) -> TextLine:
    """Uma linha de texto no template, depois girada/ampliada como numa foto."""
    theta = np.radians(angle)
    rotation = np.array([[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]])
    half = np.array([length / 2, 4.0])
    corners = [(-half[0], -half[1]), (half[0], -half[1]), (half[0], half[1]), (-half[0], half[1])]
    points = tuple(
        tuple(scale * (rotation @ (np.array(center) + np.array(c))) + np.array([40.0, 60.0]))
        for c in corners
    )
    return TextLine(text=text, points=points, score=0.9)


def document(
    angle: float = 0.0,
    scale: float = 1.0,
    parents=("IONEDA MIYAKUCHI ZAV", "SANTOS", "FRAGA ADONIS CASAL", "LIMA"),
) -> list[TextLine]:
    template = load_template()
    lines = []
    for key, text in LABEL_TEXT.items():
        anchor = template["anchors"][key]
        lines.append(make_line(text, (anchor["x"], anchor["y"]), 60.0, angle, scale))
    for field, value in VALUES.items():
        window = template["fields"][field]
        anchor = template["anchors"][window["label"]]
        x, y, width, height = window["box"]
        length = min(width, 8.0 * len(value))
        # O texto impresso é alinhado à esquerda da caixa do campo.
        center = (anchor["left"] + x + length / 2, anchor["y"] + y + height / 2)
        lines.append(make_line(value, center, length, angle, scale))
    left = template["anchors"]["filiation"]["left"]
    top = template["anchors"]["filiation"]["y"] + 20
    for index, text in enumerate(parents):
        lines.append(
            make_line(
                text,
                (left + 8.0 * len(text) / 2, top + 19.5 * index),
                8.0 * len(text),
                angle,
                scale,
            )
        )
    return lines


def confirming_reads(reads: int):
    """Simula as leituras do recorte da região: `reads` leituras certas de nome, RG e categoria."""

    def region_reads(self, key: str) -> list[str]:
        return [VALUES[key]] * reads if key in ("name", "doc", "category") else []

    return patch.object(_Reader, "region_reads", region_reads)


class ParseOldTests(unittest.TestCase):
    def read(self, reads: int = 3, **kwargs):
        with confirming_reads(reads):
            reading = parse_old(document(**kwargs))
        self.assertIsNotNone(reading, "o layout deveria ter sido reconhecido")
        return reading

    def test_reads_every_field_of_an_upright_document(self):
        fields = self.read().fields

        self.assertEqual(fields["cpf"], "52998224725")
        self.assertEqual(fields["birth_date"], "1996-05-14")
        self.assertEqual(fields["expiration_date"], "2030-02-20")
        self.assertEqual(fields["first_license_date"], "2016-09-27")
        self.assertEqual(fields["issue_date"], "2020-06-17")
        self.assertEqual(fields["cnh_number"], "07665700426")
        self.assertEqual(fields["rg"], "732213587")
        self.assertEqual(fields["issuing_state"], "MG")
        self.assertEqual(fields["issuing_authority"], "DETRAN-MG")
        self.assertEqual(fields["name"], "MARIA APARECIDA SILVA")
        self.assertEqual(fields["category"], "AB")

    def test_name_rg_and_category_need_votes_from_more_than_the_detector(self):
        # Sem imagem não há leituras do recorte: só o detector vota (1 voto, o mínimo é 2).
        fields = parse_old(document()).fields

        for field in ("name", "rg", "category"):
            self.assertNotIn(field, fields)
        self.assertIn("cpf", fields)  # os campos com validação forte não dependem de votos

    def test_few_votes_return_the_field_marked_as_uncertain(self):
        reading = self.read(reads=1)  # detector + 1 leitura = 2 votos: sai, mas incerto

        self.assertEqual(reading.fields["name"], "MARIA APARECIDA SILVA")
        self.assertEqual(sorted(reading.uncertain), ["category", "name", "rg"])

    def test_many_votes_are_not_marked_as_uncertain(self):
        reading = self.read(reads=3)  # 4 votos: confiável para todos

        self.assertEqual(reading.uncertain, [])

    def test_the_same_document_rotated_or_scaled_gives_the_same_fields(self):
        expected = self.read().fields
        for angle in (90, 180, 270, 17):
            for scale in (0.7, 1.3):
                with self.subTest(angle=angle, scale=scale):
                    self.assertEqual(self.read(angle=angle, scale=scale).fields, expected)

    def test_filiation_is_father_first_then_mother_and_joins_wrapped_surnames(self):
        fields = self.read().fields

        self.assertEqual(fields["father_name"], "IONEDA MIYAKUCHI ZAV SANTOS")
        self.assertEqual(fields["mother_name"], "FRAGA ADONIS CASAL LIMA")

    def test_filiation_with_one_line_per_parent(self):
        fields = self.read(parents=("JOSE ALVES PEREIRA", "ANA MARIA SOUZA")).fields

        self.assertEqual(fields["father_name"], "JOSE ALVES PEREIRA")
        self.assertEqual(fields["mother_name"], "ANA MARIA SOUZA")

    def test_filiation_with_a_single_name_is_not_guessed(self):
        fields = self.read(parents=("JOSE ALVES PEREIRA",)).fields

        self.assertNotIn("father_name", fields)  # não dá para saber de qual dos pais é
        self.assertNotIn("mother_name", fields)

    def test_an_invalid_value_is_dropped_instead_of_returned(self):
        lines = document()
        broken = [
            TextLine("529.982.247-26", line.points, line.score)
            if line.text == VALUES["cpf"]
            else line
            for line in lines
        ]

        with confirming_reads(3):
            fields = parse_old(broken).fields

        self.assertNotIn("cpf", fields)  # dígito verificador errado
        self.assertIn("cnh_number", fields)

    def test_not_enough_labels_means_not_this_layout(self):
        self.assertIsNone(parse_old(document()[:2]))
        self.assertIsNone(parse_old([make_line("texto qualquer", (10, 10), 80, 0, 1)]))
        self.assertIsNone(parse_old([]))


class JoinParentsTests(unittest.TestCase):
    def test_short_line_continues_the_previous_one(self):
        self.assertEqual(
            _join_parents(["A LONGA LINHA AQUI", "SOUZA"]), ["A LONGA LINHA AQUI SOUZA"]
        )

    def test_long_line_starts_a_new_name(self):
        self.assertEqual(
            _join_parents(["PRIMEIRO NOME LONGO", "SEGUNDO NOME LONGO"]),
            ["PRIMEIRO NOME LONGO", "SEGUNDO NOME LONGO"],
        )

    def test_the_first_line_is_never_a_continuation(self):
        self.assertEqual(_join_parents(["CURTO"]), ["CURTO"])


if __name__ == "__main__":
    unittest.main()
