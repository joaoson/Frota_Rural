"""Keep automatic local setup without implicitly migrating a hosted database."""

import os

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Run local startup migrations, or skip hosted databases unless explicitly enabled.'
    requires_system_checks = []

    def handle(self, *args, **options):
        mode = os.getenv('RUN_MIGRATIONS', 'auto').lower()
        if mode not in {'auto', 'true', 'false'}:
            raise CommandError('RUN_MIGRATIONS must be auto, true or false.')
        local = settings.DATABASES['default']['HOST'] in {'db', 'localhost', '127.0.0.1', '::1'}
        if mode == 'true' or (mode == 'auto' and local and not os.getenv('DATABASE_URL')):
            call_command('migrate', interactive=False, stdout=self.stdout, stderr=self.stderr)
        else:
            self.stdout.write('Startup migrations skipped. Run manage.py verify_database, then migrate explicitly.')
