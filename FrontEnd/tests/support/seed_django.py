"""Playwright-owned fixtures. Run inside the development backend via stdin."""
import json
import os
import sys
import uuid
from datetime import date

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "djangoapi.settings")
import django

django.setup()
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from chat.models import Messages
from chat.threads import format_thread_id
from machines.models import Machines
from postings.models import Postings, PostingsPhotos
from pricing.models import PricingSuggestions
from users.models import Users

if not settings.DEBUG:
    raise RuntimeError("Playwright fixtures require DJANGO_DEBUG=true")
action, run_id = sys.argv[1:]
namespace = uuid.UUID(run_id)

def identity(name):
    return uuid.uuid5(namespace, name)

owner_id, renter_id = identity("owner"), identity("renter")
user_ids = [owner_id, renter_id]
password = f"PwTest-{namespace.hex}!"
with transaction.atomic():
    if action == "delete":
        users = Users.objects.filter(id__in=user_ids)
        if any(not u.email.endswith(f"-{namespace.hex}@example.test") for u in users):
            raise RuntimeError("Refusing to delete users not owned by this fixture")
        Messages.objects.filter(Q(sender_id__in=user_ids) | Q(receiver_id__in=user_ids)).delete()
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
            Users.objects.create(
                id=uid, name=f"Playwright {name}", email=email,
                password=hashed_password, document=f"PW{uid.hex[:18]}",
                role=role, address="Castro, PR", birth_date=date(1990, 1, 1),
                city="Castro", state="PR", status="active",
            )
            accounts[name] = {"id": str(uid), "email": email, "password": password}
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
        print(json.dumps({**accounts, "machines": machines, "posting": str(posting.id),
                          "threadId": format_thread_id("posting", posting.id, owner_id, renter_id)}))
    else:
        raise ValueError("Expected create or delete")
