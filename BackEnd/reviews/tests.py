import uuid
from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone

from machines.models import Machines
from postings.models import Postings
from rentals.models import Rentals
from reviews.models import Reviews
from users.models import Users


def make_user(role, seq):
    return Users.objects.create(
        id=uuid.uuid4(),
        name=f"{role.title()} {seq}",
        document=f"doc{seq:011d}",
        email=f"{role}{seq}@teste.com",
        role=role,
        address="Rua Teste, 100",
        birth_date=date(1990, 1, 1),
        status="active",
    )


class ReviewApiTests(TestCase):
    def setUp(self):
        self.owner = make_user("locador", 1)
        self.lessee = make_user("locatario", 2)
        machine = Machines.objects.create(id=uuid.uuid4(), owner=self.owner)
        posting = Postings.objects.create(id=uuid.uuid4(), machinery=machine, hourly_rate="100.00")
        self.rental = Rentals.objects.create(
            id=uuid.uuid4(),
            postings=posting,
            lessee=self.lessee,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=2),
            status="completed",
        )

    def payload(self, **overrides):
        return {
            "rental": str(self.rental.id),
            "reviewer": str(self.lessee.id),
            "reviewee": str(self.owner.id),
            "rating": 5,
            "comment": "Trator em perfeito estado.",
            **overrides,
        }

    def post(self, body):
        return self.client.post("/api/reviews/", body, content_type="application/json")

    def test_create_returns_names(self):
        response = self.post(self.payload())

        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["reviewer_name"], self.lessee.name)
        self.assertEqual(body["reviewee_name"], self.owner.name)
        self.assertIsNotNone(body["created_at"])

    def test_second_review_by_the_same_reviewer_is_rejected(self):
        self.assertEqual(self.post(self.payload()).status_code, 201)

        response = self.post(self.payload(rating=3))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["message"], "Este avaliador já avaliou esta locação.")
        self.assertEqual(Reviews.objects.count(), 1)

    def test_rating_out_of_range_is_rejected(self):
        response = self.post(self.payload(rating=6))

        self.assertEqual(response.status_code, 400)
        self.assertIn("rating", response.json()["errors"])

    def test_list_filters_by_reviewee(self):
        self.post(self.payload())

        mine = self.client.get(f"/api/reviews/?reviewee={self.owner.id}").json()
        none = self.client.get(f"/api/reviews/?reviewee={self.lessee.id}").json()

        self.assertEqual(len(mine), 1)
        self.assertEqual(none, [])

    def test_patch_updates_only_the_rating(self):
        review_id = self.post(self.payload()).json()["id"]

        response = self.client.patch(
            f"/api/reviews/{review_id}", {"rating": 4}, content_type="application/json"
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["rating"], 4)
        self.assertEqual(response.json()["comment"], "Trator em perfeito estado.")

    def test_unknown_review_returns_standard_error_body(self):
        response = self.client.get(f"/api/reviews/{uuid.uuid4()}")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json(),
            {"code": "not_found", "message": "Avaliação não encontrada.", "errors": {}},
        )
