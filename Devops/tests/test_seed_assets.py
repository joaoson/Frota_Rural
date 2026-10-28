"""Check that the offline seed assets shipped to the browser match the manifest."""

import hashlib
import json
from pathlib import Path
import unittest
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'FrontEnd/public/demo'


class DemoAssetsTests(unittest.TestCase):
    def test_galleries_ship_the_exact_licensed_files_referenced_by_the_backend(self):
        manifest = json.loads((ASSETS / 'photos.json').read_text())
        self.assertEqual(manifest, json.loads((ROOT / 'BackEnd/demo_seed/photos.json').read_text()))
        self.assertEqual(set(manifest), {str(i) for i in range(20)})
        unique = set()
        for index, photos in manifest.items():
            self.assertTrue(photos)
            for photo in photos:
                path = (ASSETS / photo['file']).resolve()
                self.assertTrue(path.is_relative_to(ASSETS.resolve()))
                data = path.read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), photo['sha256'])
                self.assertEqual(len(data), photo['bytes'])
                self.assertTrue(data.startswith(b'\xff\xd8\xff'))
                self.assertEqual(urlsplit(photo['license_url']).hostname, 'creativecommons.org')
                unique.add(path)
        self.assertEqual(len(unique), 33)
        self.assertEqual(sum(map(len, manifest.values())), 37)

    def test_portraits_and_visible_attributions_are_shipped(self):
        prompts = json.loads((ASSETS / 'profile-prompts.json').read_text())
        self.assertEqual(len(prompts), 6)
        for portrait in prompts:
            data = (ASSETS / portrait['file']).read_bytes()
            self.assertTrue(data.startswith(b'\x89PNG\r\n\x1a\n'))
            self.assertIn('fictional', portrait['prompt'])
        credits = (ASSETS / 'credits.html').read_text()
        for index in range(20):
            self.assertIn(f'id="machine-{index:02d}"', credits)
        self.assertIn('creativecommons.org', credits)


if __name__ == '__main__':
    unittest.main()
