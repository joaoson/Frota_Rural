import json
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from machines.models import Machines
from postings.models import Postings
from rentals.models import Rentals
from users.models import Users


class MachineRecommendationTests(TestCase):
    def setUp(self) -> None:
        ai = patch("postings.recommendation_ai.find_similar", return_value=[])
        self.ai = ai.start()
        self.addCleanup(ai.stop)
        self.owner = Users.objects.create(
            id=uuid4(),
            name="Locador",
            document="finder-owner",
            email="owner@finder.test",
            role="locador",
            birth_date=date(1990, 1, 1),
        )
        self.tenant = Users.objects.create(
            id=uuid4(),
            name="Locatário",
            document="finder-tenant",
            email="tenant@finder.test",
            role="locatario",
            birth_date=date(1990, 1, 1),
        )
        self.start = timezone.localdate() + timedelta(days=10)
        self.end = self.start + timedelta(days=2)
        self.params = {
            "application": "soil_preparation",
            "soil": "clay",
            "location": "",
            "start_date": str(self.start),
            "end_date": str(self.end),
        }

    def posting(
        self,
        *,
        purpose: str = "Preparo de solo",
        status: str = "active",
        machine_status: str = "active",
        rate: str = "250.00",
        location: str = "Ribeirão Preto, SP",
        description: str = "",
        **kwargs: object,
    ) -> Postings:
        machine = Machines.objects.create(
            id=uuid4(),
            owner=self.owner,
            brand="Trator",
            model=str(uuid4())[:8],
            usage_purpose=purpose,
            status=machine_status,
        )
        return Postings.objects.create(
            id=uuid4(),
            machinery=machine,
            hourly_rate=rate,
            status=status,
            location_address=location,
            description=description,
            **kwargs,
        )

    def search(self, **overrides: object) -> Any:  # noqa: ANN401 - Django adds json() to test responses.
        return self.client.post(
            "/api/postings/recommendations",
            data=json.dumps({**self.params, **overrides}),
            content_type="application/json",
        )

    def booking(self, posting: Postings, **overrides: object) -> Rentals:
        attrs = {
            "id": uuid4(),
            "postings": posting,
            "lessee": self.tenant,
            "status": "active",
            "start_date": timezone.make_aware(datetime.combine(self.start, time(8))),
            "end_date": timezone.make_aware(datetime.combine(self.end, time(18))),
            "created_at": timezone.now(),
        }
        return Rentals.objects.create(**{**attrs, **overrides})

    def test_public_search_returns_only_matching_live_records_and_normalizes_accents(self) -> None:
        valid = self.posting()
        self.posting(purpose="Colheita")
        self.posting(status="draft")
        self.posting(status="suspended")
        self.posting(machine_status="maintenance")
        self.posting(rate="400")
        self.posting(location="Curitiba, PR")
        response = self.search(location="ribeirao preto, SP", max_hourly_rate="300.00")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["results"][0]["posting"]["id"], str(valid.pk))
        self.assertTrue(body["dates_checked"])
        self.assertNotIn("owner", body["results"][0]["posting"])
        self.assertEqual(body["match_type"], "exact")
        self.ai.assert_not_called()

    def test_soil_mentions_rank_first_without_excluding_unspecified_soils(self) -> None:
        cheap = self.posting(rate="100")
        mentioned = self.posting(
            rate="200", description="Consulte os implementos para solo argiloso."
        )
        response = self.search().json()
        self.assertEqual(
            [item["posting"]["id"] for item in response["results"]],
            [str(mentioned.pk), str(cheap.pk)],
        )
        self.assertTrue(response["results"][0]["soil_mentioned"])
        self.assertFalse(response["results"][1]["soil_mentioned"])
        self.assertIn("confira o contexto", response["results"][0]["reasons"][1])

    def test_state_filter_matches_uf_and_full_name_without_matching_street_names(self) -> None:
        valid = [
            self.posting(location="Curitiba, PR"),
            self.posting(location="Londrina - Paraná"),
            self.posting(location="Cascavel / Parana, CEP 85800-000, Brasil"),
        ]
        self.posting(location="Rua Paraná, 10 - São Paulo, SP")
        self.posting(location="Curitiba")
        self.posting(location=None)
        body = self.search(state="PR").json()
        self.assertEqual(body["total"], 3)
        self.assertEqual(
            {item["posting"]["id"] for item in body["results"]}, {str(item.pk) for item in valid}
        )

    def test_state_filter_distinguishes_states_with_similar_names(self) -> None:
        for code, location in [
            ("MT", "Cuiabá, Mato Grosso"),
            ("MS", "Dourados, Mato Grosso do Sul"),
            ("RN", "Natal, Rio Grande do Norte"),
            ("RS", "Pelotas, Rio Grande do Sul"),
            ("DF", "Brasília, Distrito Federal"),
        ]:
            posting = self.posting(location=location)
            with self.subTest(state=code):
                response = self.search(state=code).json()
                self.assertEqual(response["total"], 1)
                self.assertEqual(response["results"][0]["posting"]["id"], str(posting.pk))

    def test_fully_contains_dates_and_respects_duration_and_expiration(self) -> None:
        valid = self.posting()
        self.posting(max_reservation_days=2)
        self.posting(availability_start=timezone.make_aware(datetime.combine(self.start, time(12))))
        self.posting(availability_end=timezone.make_aware(datetime.combine(self.end, time(12))))
        self.posting(availability_end=timezone.now() - timedelta(days=1))
        self.assertEqual(
            [item["posting"]["id"] for item in self.search().json()["results"]], [str(valid.pk)]
        )
        self.assertEqual(self.search(start_date=None, end_date=None).json()["total"], 4)

    def test_conflicts_on_other_listings_of_same_machine_and_turnaround_gap(self) -> None:
        blocked = self.posting()
        duplicate = Postings.objects.create(
            id=uuid4(), machinery=blocked.machinery, hourly_rate=Decimal("200"), status="active"
        )
        self.booking(duplicate)
        adjacent = self.posting()
        self.booking(
            adjacent,
            start_date=timezone.make_aware(
                datetime.combine(self.start - timedelta(days=3), time(8))
            ),
            end_date=timezone.make_aware(
                datetime.combine(self.start - timedelta(days=1), time(10))
            ),
        )
        valid = self.posting()
        self.assertEqual(
            [item["posting"]["id"] for item in self.search().json()["results"]], [str(valid.pk)]
        )

    def test_live_holds_block_while_expired_and_cancelled_reservations_do_not(self) -> None:
        live = self.posting()
        self.booking(
            live, status="pending", reservation_expires_at=timezone.now() + timedelta(minutes=20)
        )
        expired = self.posting()
        self.booking(
            expired,
            status="awaiting_payment",
            reservation_expires_at=timezone.now() - timedelta(minutes=1),
        )
        cancelled = self.posting()
        self.booking(cancelled, status="cancelled")
        legacy_live = self.posting()
        self.booking(legacy_live, status="pending")
        legacy_expired = self.posting()
        self.booking(
            legacy_expired, status="pending", created_at=timezone.now() - timedelta(hours=1)
        )
        ids = {item["posting"]["id"] for item in self.search().json()["results"]}
        self.assertEqual(ids, {str(expired.pk), str(cancelled.pk), str(legacy_expired.pk)})

    def test_returns_three_distinct_machines_and_counts_all_matches(self) -> None:
        first = self.posting(rate="50")
        Postings.objects.create(
            id=uuid4(), machinery=first.machinery, hourly_rate=Decimal("60"), status="active"
        )
        for _ in range(4):
            self.posting()
        body = self.search(start_date=None, end_date=None).json()
        self.assertEqual(body["total"], 5)
        self.assertEqual(len(body["results"]), 3)
        self.assertEqual(len({item["posting"]["machinery"] for item in body["results"]}), 3)
        self.assertFalse(body["dates_checked"])

    def test_invalid_answers_return_validation_errors(self) -> None:
        for invalid in [
            {"application": "anything"},
            {"soil": "anything"},
            {"state": "XX"},
            {"end_date": None},
            {"start_date": str(timezone.localdate())},
            {"end_date": str(self.start - timedelta(days=1))},
            {"max_hourly_rate": "-1"},
            {"location": "x" * 121},
        ]:
            with self.subTest(invalid=invalid):
                response = self.search(**invalid)
                self.assertEqual(response.status_code, 400)
                self.assertIn("errors", response.json())

    def test_no_matches_are_not_replaced_with_unrelated_machines(self) -> None:
        self.posting(purpose="Colheita", description="Trator")
        self.assertEqual(self.search().json()["results"], [])
        self.ai.assert_called_once()

    def test_ai_only_sees_live_available_same_state_machines_and_reuses_real_listing(self) -> None:
        alternative = self.posting(
            purpose="Destorroamento",
            description="Enxada rotativa incluída para destorroar a terra.",
        )
        self.posting(purpose="Destorroamento", status="draft")
        self.posting(purpose="Destorroamento", machine_status="maintenance")
        self.posting(purpose="Destorroamento", location="Curitiba, PR")
        self.posting(purpose="Destorroamento", availability_end=timezone.now() - timedelta(days=1))
        self.posting(purpose="Destorroamento", max_reservation_days=1)
        blocked = self.posting(purpose="Destorroamento")
        self.booking(blocked)
        reason = "Possível alternativa para destorroar o solo; confirme o implemento com o locador."
        self.ai.return_value = [{"posting_id": str(alternative.pk), "reason": reason}]
        body = self.search(state="SP").json()
        self.assertEqual(body["match_type"], "similar")
        self.assertFalse(body["ai_unavailable"])
        self.assertEqual(body["results"][0]["posting"]["id"], str(alternative.pk))
        self.assertIn(reason, body["results"][0]["reasons"])
        self.assertTrue(body["dates_checked"])
        needs, catalog = self.ai.call_args.args
        self.assertEqual(
            needs, {"application": "Preparo de solo", "soil": "Argiloso", "state": "SP"}
        )
        self.assertEqual([item["posting_id"] for item in catalog], [str(alternative.pk)])
        self.assertEqual(
            set(catalog[0]),
            {"posting_id", "machine", "usage_purpose", "description", "technical_specifications"},
        )

    def test_ai_is_not_called_when_no_inventory_satisfies_hard_filters(self) -> None:
        self.posting(purpose="Destorroamento", location="Curitiba, PR")
        body = self.search(state="SP").json()
        self.assertEqual(body["match_type"], "none")
        self.ai.assert_not_called()

    def test_ai_failure_returns_usable_empty_state_without_provider_details(self) -> None:
        self.posting(purpose="Destorroamento")
        self.ai.return_value = None
        response = self.search()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"], [])
        self.assertTrue(response.json()["ai_unavailable"])

    def test_machine_booked_or_unpublished_while_ai_runs_is_not_returned(self) -> None:
        for change in ("booked", "unpublished", "description", "location"):
            with self.subTest(change=change):
                alternative = self.posting(purpose="Destorroamento")

                def select_then_change(
                    *args: object, change: str = change, alternative: Postings = alternative
                ) -> list[dict[str, str]]:
                    if change == "booked":
                        self.booking(alternative)
                    elif change == "unpublished":
                        alternative.status = "draft"
                        alternative.save(update_fields=["status"])
                    elif change == "description":
                        alternative.description = "Implemento indisponível."
                        alternative.save(update_fields=["description"])
                    else:
                        alternative.location_address = "Curitiba, PR"
                        alternative.save(update_fields=["location_address"])
                    return [{"posting_id": str(alternative.pk), "reason": "Possível alternativa."}]

                self.ai.side_effect = select_then_change
                self.assertEqual(self.search(state="SP").json()["results"], [])

    def test_ai_candidate_set_is_bounded_and_deduplicates_machines(self) -> None:
        first = self.posting(purpose="Destorroamento", rate="20")
        Postings.objects.create(
            id=uuid4(),
            machinery=first.machinery,
            hourly_rate=Decimal("30"),
            status="active",
            location_address="Ribeirão Preto, SP",
        )
        for _ in range(25):
            self.posting(purpose="Destorroamento")
        self.search()
        catalog = self.ai.call_args.args[1]
        self.assertEqual(len(catalog), 20)
        self.assertEqual(catalog[0]["posting_id"], str(first.pk))

    def test_availability_lookup_has_no_query_per_machine(self) -> None:
        for _ in range(8):
            self.posting()
        with self.assertNumQueries(2):
            response = self.search()
        self.assertEqual(response.status_code, 200)
