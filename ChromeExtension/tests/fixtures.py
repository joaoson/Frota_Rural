"""Disposable accounts for the real extension test; local Docker database only."""
import json
import os
import sys
import uuid
from datetime import date

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "djangoapi.settings")
import django

django.setup()
from django.conf import settings
from django.db import transaction
from users.models import Users

if not settings.DEBUG or settings.DATABASES["default"]["HOST"] not in {
    "db", "localhost", "127.0.0.1", "::1",
}:
    raise RuntimeError("Extension fixtures require DEBUG and a local database")

action, run_id = sys.argv[1:]
namespace = uuid.UUID(run_id)
roles = ("locador", "locatario", "admin")
identities = {role: uuid.uuid5(namespace, role) for role in roles}
with transaction.atomic():
    if action == "create":
        accounts = {}
        for role, identity in identities.items():
            email = f"extension-{role}-{namespace.hex}@example.test"
            password = f"Extension-{namespace.hex}!"
            user = Users(
                id=identity, name=f"Extension test {role}", email=email,
                document=f"EXT{identity.hex[:17]}", role=role, status="active",
                address="Rua de teste, 1", city="Castro", state="PR",
                birth_date=date(1990, 1, 1),
            )
            user.set_password(password)
            user.save(force_insert=True)
            accounts[role] = {"email": email, "password": password}
        print(json.dumps(accounts))
    elif action == "delete":
        users = Users.objects.filter(id__in=identities.values())
        if any(u.email != f"extension-{u.role}-{namespace.hex}@example.test" for u in users):
            raise RuntimeError("Refusing to remove accounts not owned by this test")
        users.delete()
    else:
        raise ValueError("Unknown fixture action")
