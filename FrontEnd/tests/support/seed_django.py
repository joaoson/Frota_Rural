"""Playwright-owned fixtures. Run inside the development backend via stdin."""
import json
import os
import sys
import uuid
from datetime import date, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "djangoapi.settings")
import django

django.setup()
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rentals.models import Rentals
from api.models import RentalRecurrence
from chat.models import Messages
from chat.threads import format_thread_id
from contracts.models import Contracts
from machines.models import Machines
from postings.models import Postings, PostingsPhotos
from pricing.models import PricingSuggestions
from reviews.models import Reviews
from users.models import Users
from rest_framework_simplejwt.tokens import AccessToken

if not settings.DEBUG:
    raise RuntimeError("Playwright fixtures require DJANGO_DEBUG=true")
if settings.DATABASES['default']['HOST'] not in {'db', 'localhost', '127.0.0.1', '::1'}:
    raise RuntimeError("Playwright fixtures require a local database; select a local E2E_BACKEND_CONTAINER")
action, run_id = sys.argv[1:]
namespace = uuid.UUID(run_id)

def identity(name):
    return uuid.uuid5(namespace, name)

owner_id, renter_id = identity("owner"), identity("renter")
user_ids = [owner_id, renter_id]
password = f"PwTest-{namespace.hex}!"
with transaction.atomic():
    if action == "delete":
        user_ids += list(Users.objects.filter(email=f"pw-operator-{namespace.hex}@example.test").values_list("id", flat=True))
        users = Users.objects.filter(id__in=user_ids)
        if any(not u.email.endswith(f"-{namespace.hex}@example.test") for u in users):
            raise RuntimeError("Refusing to delete users not owned by this fixture")
        Messages.objects.filter(Q(sender_id__in=user_ids) | Q(receiver_id__in=user_ids)).delete()
        Reviews.objects.filter(Q(reviewer_id__in=user_ids) | Q(reviewee_id__in=user_ids)).delete()
        # Only records owned by this fixture are removed. Source rentals and
        # generated series protect each other until the occurrence link is cleared.
        Rentals.objects.filter(lessee_id=renter_id).update(recurrence=None)
        RentalRecurrence.objects.filter(lessee_id=renter_id).delete()
        Contracts.objects.filter(rental__lessee_id=renter_id).delete()
        Rentals.objects.filter(lessee_id=renter_id).delete()
        PricingSuggestions.objects.filter(machinery__owner_id=owner_id).delete()
        PostingsPhotos.objects.filter(postings__machinery__owner_id=owner_id).delete()
        Postings.objects.filter(machinery__owner_id=owner_id).delete()
        Machines.objects.filter(owner_id=owner_id).delete()
        users.delete()
        print(json.dumps({"deleted": run_id}))
    elif action == "create":
        accounts = {}
        hashed_password = make_password(password)
        for name, role in [("owner", "locador"), ("renter", "locatario")]:
            uid = identity(name)
            email = f"pw-{name}-{namespace.hex}@example.test"
            user = Users.objects.create(
                id=uid, name=f"Playwright {name}", email=email,
                password=hashed_password, document=f"PW{uid.hex[:18]}",
                role=role, address="Castro, PR", birth_date=date(1990, 1, 1),
                city="Castro", state="PR", status="active",
            )
            expired_access = AccessToken.for_user(user)
            expired_access.set_exp(lifetime=timedelta(seconds=-1))
            accounts[name] = {
                "id": str(uid), "email": email, "password": password,
                "expiredAccess": str(expired_access),
            }
        machines = []
        for index, model in enumerate(["6110J", "6125J"]):
            machine = Machines.objects.create(
                id=identity(f"machine-{index}"), owner_id=owner_id,
                brand="John Deere", model=model, year=2019, power_cv=110,
                hour_meter=3000, usage_purpose="trator", status="active",
                renagro_number=f"PW-{namespace.hex}-{index}", created_at=timezone.now(),
            )
            machines.append(str(machine.id))
        posting = Postings.objects.create(
            id=identity("posting"), machinery_id=machines[0], hourly_rate="180.00",
            location_address="Castro, PR", description="Playwright chat fixture",
            status="active", created_at=timezone.now(),
        )
        Messages.objects.create(posting=posting, sender_id=renter_id, receiver_id=owner_id,
                                content="Conversa de teste iniciada.")
        source_start = (timezone.now() - timedelta(days=40)).replace(
            hour=8, minute=0, second=0, microsecond=0,
        )
        source = Rentals.objects.create(
            id=identity("source-rental"), postings=posting, lessee_id=renter_id,
            start_date=source_start, end_date=source_start + timedelta(days=1, hours=10),
            total_price="4321.00", status="completed", initial_hour_meter=1000,
            final_hour_meter=1016, created_at=source_start - timedelta(days=1),
        )
        Contracts.objects.create(
            id=identity("source-contract"), rental=source, status="signed",
            accepted_by_lessor=True, accepted_by_lessee=True, created_at=source_start,
        )
        print(json.dumps({**accounts, "machines": machines, "posting": str(posting.id),
                          "threadId": format_thread_id("posting", posting.id, owner_id, renter_id),
                          "sourceRental": str(source.id)}))
    else:
        raise ValueError("Expected create or delete")
