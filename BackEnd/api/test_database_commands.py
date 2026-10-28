import os
from io import StringIO
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase


class DatabaseCommandTests(SimpleTestCase):
    def test_startup_migrates_default_local_database(self):
        with patch.dict(os.environ, {}, clear=True), patch(
            'api.management.commands.migrate_on_startup.settings.DATABASES', {'default': {'HOST': 'db'}}
        ), patch('api.management.commands.migrate_on_startup.call_command') as migrate:
            call_command('migrate_on_startup', stdout=StringIO())
        migrate.assert_called_once()
        self.assertEqual(migrate.call_args.args, ('migrate',))

    def test_startup_skips_remote_database_and_any_url_by_default(self):
        for host, env in [('db.project.supabase.co', {}), ('db', {'DATABASE_URL': 'postgres://u:p@db/test'}),
                          ('db', {'RUN_MIGRATIONS': 'false'})]:
            with self.subTest(host=host, env=env), patch.dict(os.environ, env, clear=True), patch(
                'api.management.commands.migrate_on_startup.settings.DATABASES', {'default': {'HOST': host}}
            ), patch('api.management.commands.migrate_on_startup.call_command') as migrate:
                call_command('migrate_on_startup', stdout=StringIO())
                migrate.assert_not_called()

    def test_startup_allows_explicit_migration_and_rejects_typos(self):
        with patch.dict(os.environ, {'RUN_MIGRATIONS': 'true'}, clear=True), patch(
            'api.management.commands.migrate_on_startup.settings.DATABASES', {'default': {'HOST': 'remote'}}
        ), patch('api.management.commands.migrate_on_startup.call_command') as migrate:
            call_command('migrate_on_startup', stdout=StringIO())
            migrate.assert_called_once()
        with patch.dict(os.environ, {'RUN_MIGRATIONS': 'tru'}, clear=True), self.assertRaises(CommandError):
            call_command('migrate_on_startup', stdout=StringIO())

    def fake_connection(self):
        connection = MagicMock()
        connection.settings_dict = {
            'HOST': 'db.project.supabase.co', 'PORT': '5432', 'NAME': 'postgres', 'PASSWORD': 'TOPSECRET',
            'OPTIONS': {'sslmode': 'require', 'options': '-c search_path=frota_rural'},
        }
        connection.connection.pgconn.ssl_in_use = True
        return connection

    def test_verify_database_uses_read_only_queries_and_does_not_print_password(self):
        connection = self.fake_connection()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect = [('postgres', 'frota_rural'), (True, True)]
        output = StringIO()
        with patch('api.management.commands.verify_database.connection', connection):
            call_command('verify_database', stdout=output)
        self.assertIn('TLS=enabled', output.getvalue())
        self.assertNotIn('TOPSECRET', output.getvalue())
        for query in cursor.execute.call_args_list:
            self.assertTrue(query.args[0].startswith('SELECT '))

    def test_verify_database_redacts_driver_exceptions(self):
        connection = self.fake_connection()
        connection.cursor.side_effect = RuntimeError('password TOPSECRET was rejected')
        with patch('api.management.commands.verify_database.connection', connection), self.assertRaises(CommandError) as result:
            call_command('verify_database', stdout=StringIO())
        self.assertNotIn('TOPSECRET', str(result.exception))

    def test_verify_database_rejects_missing_schema(self):
        connection = self.fake_connection()
        connection.cursor.return_value.__enter__.return_value.fetchone.side_effect = [('postgres', None), None]
        with patch('api.management.commands.verify_database.connection', connection), self.assertRaisesMessage(CommandError, 'schema is missing'):
            call_command('verify_database', stdout=StringIO())

    def test_verify_database_requires_tls_to_supabase(self):
        connection = self.fake_connection()
        connection.connection.pgconn.ssl_in_use = False
        connection.cursor.return_value.__enter__.return_value.fetchone.side_effect = [('postgres', 'frota_rural'), (True, True)]
        with patch('api.management.commands.verify_database.connection', connection), self.assertRaisesMessage(CommandError, 'not encrypted'):
            call_command('verify_database', stdout=StringIO())
