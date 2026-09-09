"""The documented Docker seed command must work against the current schema."""
import contextlib
import io
import runpy

from django.conf import settings
from django.test import TestCase

from chat.models import Messages
from machines.models import Machines
from users.models import Users


class DevelopmentSeedTests(TestCase):
    def test_seed_creates_login_ready_users_machines_and_chat(self):
        with contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(settings.BASE_DIR / "seed.py"), run_name="__main__")
        self.assertEqual(Users.objects.count(), 20)
        self.assertTrue(Users.objects.get(email="joao.silva@email.com").check_password("Teste1234"))
        self.assertEqual(Machines.objects.count(), 20)
        for machine in Machines.objects.all():
            self.assertRegex(machine.renagro_number, r"^BR\d{10}$")
        self.assertEqual(Messages.objects.count(), 20)
        for message in Messages.objects.select_related("rental__postings__machinery"):
            self.assertEqual(message.sender_id, message.rental.lessee_id)
            self.assertEqual(message.receiver_id, message.rental.postings.machinery.owner_id)
