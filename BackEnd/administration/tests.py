import uuid
from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from administration.models import PostingModeration
from administration.services import UserModerationService
from contracts.models import Contracts
from contracts.services import ContractService
from machines.models import Machines
from postings.models import Postings
from rentals.models import Rentals
from users.models import Users


def make_user(role, seq, status="active"):
    return Users.objects.create(
        id=uuid.uuid4(),
        name=f"{role.title()} {seq}",
        document=f"doc{seq:011d}",
        email=f"{role}{seq}@teste.com",
        role=role,
        address="Rua Teste, 100",
        birth_date=date(1990, 1, 1),
        status=status,
    )


class ModerationTestCase(TestCase):
    def setUp(self):
        self.admin = make_user("admin", 99)
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {AccessToken.for_user(self.admin)}"
        self.owner = make_user("locador", 1)
        self.lessee = make_user("locatario", 2)
        machine = Machines.objects.create(id=uuid.uuid4(), owner=self.owner)
        self.posting = Postings.objects.create(
            id=uuid.uuid4(), machinery=machine, hourly_rate="100.00", status="active"
        )
        start = timezone.now() + timedelta(days=5)
        self.rental = Rentals.objects.create(
            id=uuid.uuid4(),
            postings=self.posting,
            lessee=self.lessee,
            start_date=start,
            end_date=start + timedelta(days=2),
            status="pending",
        )
        self.contract = ContractService.create_for_rental(self.rental)

    def put(self, url, body=None):
        return self.client.put(url, body or {}, content_type="application/json")


class UserModerationTests(ModerationTestCase):
    def test_ban_cancels_pending_rentals_and_their_contracts(self):
        response = self.put(f"/api/admin/users/{self.lessee.id}/ban")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.json(), {"message": "Usuário Locatario 2 banido permanentemente."}
        )
        self.rental.refresh_from_db()
        self.contract.refresh_from_db()
        self.lessee.refresh_from_db()
        self.assertEqual(self.lessee.status, "banned")
        self.assertEqual(self.rental.status, "cancelled")
        # Regressão: a lista de locações era reavaliada depois do cancelamento e
        # os contratos pendentes nunca eram cancelados.
        self.assertEqual(self.contract.status, "cancelled")

    def test_ban_of_owner_inactivates_postings(self):
        self.put(f"/api/admin/users/{self.owner.id}/ban")

        self.posting.refresh_from_db()
        self.assertEqual(self.posting.status, "inactive")

    def test_ban_is_atomic(self):
        with (
            patch.object(Contracts.objects, "filter", side_effect=RuntimeError("falha simulada")),
            self.assertRaises(RuntimeError),
        ):
            UserModerationService.ban(self.lessee.id)

        self.lessee.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(self.lessee.status, "active")
        self.assertEqual(self.rental.status, "pending")

    def test_suspend_pauses_active_postings_and_cancels_pending_rentals(self):
        self.put(f"/api/admin/users/{self.owner.id}/suspend")
        self.put(f"/api/admin/users/{self.lessee.id}/suspend")

        self.posting.refresh_from_db()
        self.rental.refresh_from_db()
        self.assertEqual(self.posting.status, "suspended")
        self.assertEqual(self.rental.status, "cancelled")
        self.contract.refresh_from_db()
        self.assertEqual(self.contract.status, "cancelled")

    def test_cannot_warn_a_banned_user(self):
        banned = make_user("locatario", 3, status="banned")

        response = self.put(f"/api/admin/users/{banned.id}/warn")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["message"], "Usuário já está banido.")

    def test_unknown_user_returns_404(self):
        response = self.put(f"/api/admin/users/{uuid.uuid4()}/warn")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Usuário não encontrado.")


class PostingModerationTests(ModerationTestCase):
    def test_reject_requires_a_reason(self):
        response = self.put(f"/api/admin/postings/{self.posting.id}/reject", {"reason": "  "})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"], {"reason": ["Informe o motivo da reprovação."]})
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.status, "active")

    def test_reject_records_the_reason_in_history(self):
        response = self.put(
            f"/api/admin/postings/{self.posting.id}/reject", {"reason": "Fotos de outra máquina."}
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.status, "rejected")
        moderation = PostingModeration.objects.get()
        self.assertEqual(moderation.action, "rejected")
        self.assertEqual(moderation.reason, "Fotos de outra máquina.")

    def test_approve_records_history(self):
        Postings.objects.filter(id=self.posting.id).update(status="rejected")

        response = self.put(f"/api/admin/postings/{self.posting.id}/approve")

        self.assertEqual(response.status_code, 200, response.content)
        self.posting.refresh_from_db()
        self.assertEqual(self.posting.status, "active")
        self.assertEqual(PostingModeration.objects.get().action, "approved")
