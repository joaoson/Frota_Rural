from typing import TYPE_CHECKING, Any
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import TestCase, override_settings

from djangoapi.firebase_storage import FirebaseStorageNotConfigured
from users.services import UserPhotoService
from users.tests import auth, make_user

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse

BUCKET = "frota-rural-test.firebasestorage.app"


@override_settings(FIREBASE_STORAGE_BUCKET=BUCKET, FIREBASE_CREDENTIALS_FILE="/tmp/fake.json")
class UserPhotoUploadTests(TestCase):
    def setUp(self) -> None:
        self.user = make_user("locatario", "Ana", 1)
        self.url = f"/api/users/{self.user.id}/photo"
        self.path = f"profiles/{self.user.id}/new.jpg"
        self.upload = self.enterContext(
            patch("users.services.firebase_storage.upload_image", return_value=self.path)
        )
        self.delete = self.enterContext(patch("users.services.firebase_storage.delete_image"))

    def image(self, content_type: str = "image/jpeg", size: int = 64) -> SimpleUploadedFile:
        return SimpleUploadedFile("foto.jpg", b"x" * size, content_type=content_type)

    def post(self, **data: Any) -> "_MonkeyPatchedWSGIResponse":
        return self.client.post(self.url, {"image": self.image(), **data}, **auth(self.user))

    def test_upload_stores_path_and_returns_url_for_every_account_role(self) -> None:
        for role in ("locador", "locatario", "operador", "admin"):
            with self.subTest(role=role):
                self.user.role = role
                self.user.save(update_fields=["role"])
                response = self.post()
                self.assertEqual(response.status_code, 200, response.content)
                self.user.refresh_from_db()
                self.assertEqual(self.user.profile_photo, self.path)
                self.assertEqual(
                    response.json()["profile_photo_url"],
                    f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}"
                    f"/o/profiles%2F{self.user.id}%2Fnew.jpg?alt=media",
                )
                self.assertEqual(self.upload.call_args.kwargs["folder"], f"profiles/{self.user.id}")
                self.assertNotIn("profile_photo", response.json())
                self.assertNotIn("password", response.json())
                detail = self.client.get(f"/api/users/{self.user.id}", **auth(self.user))
                self.assertEqual(
                    detail.json()["profile_photo_url"], response.json()["profile_photo_url"]
                )

    def test_no_photo_returns_null(self) -> None:
        response = self.client.get(f"/api/users/{self.user.id}", **auth(self.user))
        self.assertIsNone(response.json()["profile_photo_url"])

    def test_requires_authentication(self) -> None:
        response = self.client.post(self.url, {"image": self.image()})
        self.assertEqual(response.status_code, 401)
        self.upload.assert_not_called()

    def test_only_the_owner_can_upload_even_when_caller_is_admin(self) -> None:
        for index, role in enumerate(("locatario", "admin"), start=2):
            with self.subTest(role=role):
                other = make_user(role, "Outro", index)
                response = self.client.post(self.url, {"image": self.image()}, **auth(other))
                self.assertEqual(response.status_code, 404)
        self.upload.assert_not_called()

    def test_rejects_invalid_files_before_contacting_firebase(self) -> None:
        cases = (
            (self.image(content_type="application/pdf"), "Tipo de arquivo"),
            (self.image(size=5 * 1024 * 1024 + 1), "máximo de 5MB"),
        )
        for image, message in cases:
            with self.subTest(message=message):
                response = self.post(image=image)
                self.assertEqual(response.status_code, 400)
                self.assertIn(message, response.json()["message"])
        self.upload.assert_not_called()

    def test_accepts_each_supported_image_type_and_size_limit(self) -> None:
        for content_type in ("image/jpeg", "image/png", "image/webp"):
            with self.subTest(content_type=content_type):
                response = self.post(
                    image=self.image(content_type=content_type, size=5 * 1024 * 1024)
                )
                self.assertEqual(response.status_code, 200)

    def test_missing_file_and_json_body_have_actionable_errors(self) -> None:
        response = self.client.post(self.url, {}, **auth(self.user))
        self.assertEqual(response.status_code, 400)
        self.assertIn("Nenhum arquivo", response.json()["message"])
        response = self.client.post(
            self.url, {"image": "fake"}, content_type="application/json", **auth(self.user)
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("multipart/form-data", response.json()["message"])
        self.upload.assert_not_called()

    def test_replacement_deletes_previous_photo_only_after_commit(self) -> None:
        previous = f"profiles/{self.user.id}/old.jpg"
        self.user.profile_photo = previous
        self.user.save()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post()
            self.assertEqual(response.status_code, 200)
            self.delete.assert_not_called()
            self.user.refresh_from_db()
            self.assertEqual(self.user.profile_photo, self.path)
        self.delete.assert_called_once_with(previous)

    def test_storage_failures_preserve_previous_photo(self) -> None:
        self.user.profile_photo = "profiles/old.jpg"
        self.user.save()
        for error, status in (
            (FirebaseStorageNotConfigured("sem config"), 503),
            (RuntimeError("offline"), 502),
        ):
            with self.subTest(status=status):
                self.upload.side_effect = error
                self.assertEqual(self.post().status_code, status)
                self.user.refresh_from_db()
                self.assertEqual(self.user.profile_photo, "profiles/old.jpg")
        self.delete.assert_not_called()

    def test_failed_database_save_cleans_up_new_upload(self) -> None:
        self.user.profile_photo = "profiles/old.jpg"
        self.user.save()
        with (
            patch("users.models.Users.save", side_effect=IntegrityError("save failed")),
            self.assertRaises(IntegrityError),
        ):
            UserPhotoService.upload(
                self.user.pk, self.image(), content_type="multipart/form-data", actor=self.user
            )
        self.delete.assert_called_once_with(self.path)
        self.user.refresh_from_db()
        self.assertEqual(self.user.profile_photo, "profiles/old.jpg")

    def test_cleanup_failure_does_not_fail_a_saved_upload(self) -> None:
        self.user.profile_photo = "profiles/old.jpg"
        self.user.save()
        self.delete.side_effect = RuntimeError("offline")
        with (
            self.assertLogs("users.services", level="ERROR"),
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = self.post()
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.profile_photo, self.path)

    def test_profile_patch_cannot_set_photo_path_or_url(self) -> None:
        for field in ("profile_photo", "profile_photo_url"):
            with self.subTest(field=field):
                response = self.client.patch(
                    f"/api/users/{self.user.id}",
                    {field: "profiles/someone-else.jpg"},
                    content_type="application/json",
                    **auth(self.user),
                )
                self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.profile_photo)
