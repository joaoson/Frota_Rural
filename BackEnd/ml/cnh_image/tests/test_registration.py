"""Registro por âncoras: rotação, escala e posição a partir dos rótulos reconhecidos."""

import unittest

import numpy as np
from lib.registration import fit_similarity, register

TEMPLATE = {
    "a": (100.0, 100.0),
    "b": (500.0, 120.0),
    "c": (300.0, 400.0),
    "d": (450.0, 700.0),
    "e": (120.0, 650.0),
}


def photograph(
    angle_degrees: float, scale: float, shift: tuple[float, float]
) -> dict[str, tuple[float, float]]:
    """Posições que os mesmos rótulos teriam numa foto girada, ampliada e deslocada."""
    angle = np.radians(angle_degrees)
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    return {
        key: tuple(scale * (rotation @ np.array(point)) + np.array(shift))
        for key, point in TEMPLATE.items()
    }


class FitSimilarityTests(unittest.TestCase):
    def test_recovers_rotation_scale_and_translation(self):
        source = np.array(list(photograph(30, 1.4, (50, -20)).values()))
        target = np.array(list(TEMPLATE.values()))

        transform = fit_similarity(source, target)

        self.assertIsNotNone(transform)
        mapped = np.array([transform.apply(tuple(p)) for p in source])
        np.testing.assert_allclose(mapped, target, atol=1e-6)
        self.assertAlmostEqual(transform.scale, 1 / 1.4, places=6)

    def test_invert_goes_back_to_the_photo(self):
        photo = photograph(90, 0.8, (10, 10))
        transform = fit_similarity(
            np.array(list(photo.values())), np.array(list(TEMPLATE.values()))
        )
        for point in photo.values():
            back = transform.invert(transform.apply(point))
            np.testing.assert_allclose(back, point, atol=1e-6)

    def test_never_mirrors(self):
        mirrored = np.array([(-x, y) for x, y in TEMPLATE.values()])
        transform = fit_similarity(mirrored, np.array(list(TEMPLATE.values())))
        self.assertGreater(np.linalg.det(transform.rotation), 0)

    def test_degenerate_input(self):
        self.assertIsNone(fit_similarity(np.array([[1.0, 1.0]]), np.array([[2.0, 2.0]])))
        same = np.array([[5.0, 5.0], [5.0, 5.0]])
        self.assertIsNone(fit_similarity(same, same))


class RegisterTests(unittest.TestCase):
    def test_works_for_every_orientation(self):
        for angle in (0, 90, 180, 270, 12):
            with self.subTest(angle=angle):
                found = photograph(angle, 1.1, (30, 40))

                result = register(found, TEMPLATE, tolerance=5.0)

                self.assertIsNotNone(result)
                transform, inliers = result
                self.assertEqual(sorted(inliers), sorted(TEMPLATE))
                for key, point in found.items():
                    np.testing.assert_allclose(transform.apply(point), TEMPLATE[key], atol=1e-4)

    def test_one_wrong_label_does_not_ruin_the_fit(self):
        found = photograph(90, 1.0, (0, 0))
        found["c"] = (9999.0, 9999.0)  # rótulo lido no lugar errado

        transform, inliers = register(found, TEMPLATE, tolerance=5.0)

        self.assertNotIn("c", inliers)
        np.testing.assert_allclose(transform.apply(found["a"]), TEMPLATE["a"], atol=1e-4)

    def test_needs_at_least_three_matching_anchors(self):
        found = photograph(0, 1.0, (0, 0))
        self.assertIsNone(register({k: found[k] for k in ("a", "b")}, TEMPLATE, tolerance=5.0))
        self.assertIsNone(
            register({"zzz": (1.0, 1.0), "yyy": (2.0, 2.0), "xxx": (3.0, 3.0)}, TEMPLATE, 5.0)
        )


if __name__ == "__main__":
    unittest.main()
