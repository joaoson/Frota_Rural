import io
import uuid
from datetime import date
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone

from machines.models import Machines
from postings.models import Postings, PostingsPhotos
from users.models import Users

BUCKET = "frota-rural-test.firebasestorage.app"


@override_settings(FIREBASE_STORAGE_BUCKET=BUCKET, FIREBASE_CREDENTIALS_FILE="/tmp/fake.json")
class PostingPhotoUploadTests(TestCase):
    def setUp(self):
        owner = Users.objects.create(
            id=uuid.uuid4(),
            name="Locador Teste",
            document="12345678901",
            email="locador@teste.com",
            role="locador",
            address="Rua Teste, 100",
            birth_date=date(1990, 1, 1),
        )
        machine = Machines.objects.create(
            id=uuid.uuid4(),
            owner=owner,
            renagro_number="RN-0001",
            brand="John Deere",
            model="6110J",
            year=2020,
        )
        self.posting = Postings.objects.create(
            id=uuid.uuid4(),
            machinery=machine,
            hourly_rate="480.00",
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )
        self.url = f"/api/postings/{self.posting.id}/photos/"

    def _image(self, name="foto.jpg", content_type="image/jpeg", size=64):
        return SimpleUploadedFile(name, b"x" * size, content_type=content_type)

    def test_upload_stores_only_the_path_and_returns_public_url(self):
        with patch(
            "postings.views.firebase_storage.upload_image",
            return_value=f"postings/{self.posting.id}/abc.jpg",
        ) as upload:
            response = self.client.post(
                self.url, {"image": self._image(), "is_primary": "true"}
            )

        self.assertEqual(response.status_code, 201)
        upload.assert_called_once()
        self.assertEqual(upload.call_args.kwargs["folder"], f"postings/{self.posting.id}")

        photo = PostingsPhotos.objects.get()
        # O banco guarda o caminho, nunca a URL completa.
        self.assertEqual(photo.image_url, f"postings/{self.posting.id}/abc.jpg")
        self.assertTrue(photo.is_primary)

        body = response.json()
        self.assertEqual(body["path"], photo.image_url)
        self.assertEqual(
            body["url"],
            f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}"
            f"/o/postings%2F{self.posting.id}%2Fabc.jpg?alt=media",
        )

    def test_new_cover_demotes_the_previous_one(self):
        old = PostingsPhotos.objects.create(
            id=uuid.uuid4(),
            postings=self.posting,
            image_url="postings/old.jpg",
            is_primary=True,
            created_at=timezone.now(),
        )
        with patch(
            "postings.views.firebase_storage.upload_image", return_value="postings/new.jpg"
        ):
            response = self.client.post(
                self.url, {"image": self._image(), "is_primary": "true"}
            )

        self.assertEqual(response.status_code, 201)
        old.refresh_from_db()
        self.assertFalse(old.is_primary)
        self.assertEqual(PostingsPhotos.objects.filter(is_primary=True).count(), 1)

    def test_rejects_unsupported_content_type(self):
        with patch("postings.views.firebase_storage.upload_image") as upload:
            response = self.client.post(
                self.url,
                {"image": self._image(name="doc.pdf", content_type="application/pdf")},
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn("application/pdf", response.json()["error"])
        upload.assert_not_called()
        self.assertEqual(PostingsPhotos.objects.count(), 0)

    def test_rejects_file_over_5mb(self):
        with patch("postings.views.firebase_storage.upload_image") as upload:
            response = self.client.post(
                self.url, {"image": self._image(size=5 * 1024 * 1024 + 1)}
            )
        self.assertEqual(response.status_code, 400)
        self.assertIn("excede o", response.json()["error"])
        upload.assert_not_called()

    def test_returns_503_when_firebase_is_not_configured(self):
        from djangoapi.firebase_storage import FirebaseStorageNotConfigured

        with patch(
            "postings.views.firebase_storage.upload_image",
            side_effect=FirebaseStorageNotConfigured("faltou config"),
        ):
            response = self.client.post(self.url, {"image": self._image()})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(PostingsPhotos.objects.count(), 0)

    def test_non_multipart_body_says_so_instead_of_no_file(self):
        """Regressão: cliente que manda JSON recebia 'Nenhum arquivo enviado.',
        mensagem que escondia a causa real (Content-Type errado)."""
        response = self.client.post(self.url, {"image": "x"}, content_type="application/json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("multipart/form-data", response.json()["error"])
        self.assertIn("application/json", response.json()["error"])

    def test_missing_file_in_multipart_still_says_no_file(self):
        response = self.client.post(self.url, {"is_primary": "true"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Nenhum arquivo enviado.")

    def test_unknown_posting_returns_404(self):
        response = self.client.post(
            f"/api/postings/{uuid.uuid4()}/photos/", {"image": self._image()}
        )
        self.assertEqual(response.status_code, 404)


@override_settings(FIREBASE_STORAGE_BUCKET=BUCKET, FIREBASE_CREDENTIALS_FILE="/tmp/fake.json")
class PostingPhotoSerializationTests(TestCase):
    def setUp(self):
        owner = Users.objects.create(
            id=uuid.uuid4(),
            name="Locador Teste",
            document="98765432100",
            email="outro@teste.com",
            role="locador",
            address="Rua Teste, 200",
            birth_date=date(1985, 5, 5),
        )
        machine = Machines.objects.create(
            id=uuid.uuid4(), owner=owner, renagro_number="RN-0002", brand="Valtra", model="BH180"
        )
        self.posting = Postings.objects.create(
            id=uuid.uuid4(),
            machinery=machine,
            hourly_rate="300.00",
            status="active",
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

    def _photo(self, image_url, is_primary):
        return PostingsPhotos.objects.create(
            id=uuid.uuid4(),
            postings=self.posting,
            image_url=image_url,
            is_primary=is_primary,
            created_at=timezone.now(),
        )

    def test_detail_puts_cover_first_and_expands_paths(self):
        self._photo("postings/segunda.jpg", False)
        self._photo("postings/capa.jpg", True)

        response = self.client.get(f"/api/postings/{self.posting.id}")
        photos = response.json()["photos"]

        self.assertEqual(response.status_code, 200)
        self.assertTrue(photos[0]["is_primary"])
        self.assertTrue(photos[0]["url"].endswith("o/postings%2Fcapa.jpg?alt=media"))
        self.assertTrue(photos[0]["url"].startswith("https://firebasestorage.googleapis.com/"))

    def test_legacy_absolute_urls_pass_through_untouched(self):
        legacy = "https://storage.example.com/postings/legado.jpg"
        self._photo(legacy, True)

        response = self.client.get("/api/postings/")
        item = next(p for p in response.json() if p["id"] == str(self.posting.id))
        self.assertEqual(item["primary_photo_url"], legacy)

    def test_list_returns_null_when_there_are_no_photos(self):
        response = self.client.get("/api/postings/")
        item = next(p for p in response.json() if p["id"] == str(self.posting.id))
        self.assertIsNone(item["primary_photo_url"])
