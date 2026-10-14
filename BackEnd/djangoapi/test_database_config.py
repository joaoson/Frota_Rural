import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured

from djangoapi.database import database_config, load_environment


class DatabaseConfigTests(unittest.TestCase):
    def test_local_database_keeps_postgres_settings_without_requiring_ssl(self):
        config = database_config({'DB_NAME': 'local', 'DB_USER': 'user', 'DB_PASSWORD': 'secret', 'DB_HOST': 'db'})
        self.assertEqual((config['NAME'], config['USER'], config['PASSWORD'], config['HOST'], config['PORT']),
                         ('local', 'user', 'secret', 'db', '5432'))
        self.assertNotIn('sslmode', config['OPTIONS'])
        self.assertNotIn('options', config['OPTIONS'])

    def test_root_docker_names_work_for_native_django(self):
        config = database_config({'POSTGRES_DB': 'root', 'POSTGRES_USER': 'user', 'POSTGRES_PASSWORD': 'password', 'POSTGRES_PORT': '5433'})
        self.assertEqual((config['NAME'], config['USER'], config['PASSWORD']), ('root', 'user', 'password'))
        self.assertEqual(config['PORT'], '5433')

    def test_database_url_wins_over_docker_defaults_and_decodes_credentials(self):
        config = database_config({
            'DATABASE_URL': 'postgresql://some%40user:p%40ss%3A%2F%23%3F%25%24%26@db.example.com:5433/my%20database',
            'DB_NAME': 'ignored', 'DB_USER': 'ignored', 'DB_PASSWORD': 'ignored', 'DB_HOST': 'db', 'DB_PORT': '5432',
        })
        self.assertEqual((config['USER'], config['PASSWORD']), ('some@user', 'p@ss:/#?%$&'))
        self.assertEqual((config['NAME'], config['HOST'], config['PORT']), ('my database', 'db.example.com', '5433'))

    def test_supabase_direct_and_session_pooler_default_to_tls_and_private_schema(self):
        for host in ('db.project.supabase.co', 'aws-1-us-east-1.pooler.supabase.com'):
            with self.subTest(host=host):
                config = database_config({'DATABASE_URL': f'postgres://postgres:secret@{host}:5432/postgres'})
                self.assertEqual(config['OPTIONS']['sslmode'], 'require')
                self.assertEqual(config['OPTIONS']['options'], '-c search_path=frota_rural')
                self.assertEqual(config['CONN_MAX_AGE'], 0)

    def test_supabase_db_fields_receive_the_same_defaults(self):
        config = database_config({'DB_HOST': 'db.project.supabase.co'})
        self.assertEqual(config['OPTIONS']['sslmode'], 'require')
        self.assertEqual(config['OPTIONS']['options'], '-c search_path=frota_rural')

    def test_certificate_and_url_options_override_environment(self):
        config = database_config({
            'DATABASE_URL': 'postgresql://u:p@db.project.supabase.co/postgres?sslmode=verify-full&sslrootcert=%2Fapp%2Fca.crt&connect_timeout=5',
            'DB_SSLMODE': 'require', 'DB_CONNECT_TIMEOUT': '10', 'DB_SCHEMA': 'rental',
        })
        self.assertEqual(config['OPTIONS'], {
            'sslmode': 'verify-full', 'sslrootcert': '/app/ca.crt', 'connect_timeout': 5, 'options': '-c search_path=rental',
        })

    def test_ipv6_local_url(self):
        config = database_config({'DATABASE_URL': 'postgres://u:p@[::1]:5432/local'})
        self.assertEqual(config['HOST'], '::1')
        self.assertNotIn('sslmode', config['OPTIONS'])

    def test_invalid_urls_never_echo_password(self):
        urls = [
            'mysql://u:TOPSECRET@host/database', 'postgres://u:TOPSECRET@host',
            'postgres://u:TOPSECRET@host/db#fragment', 'postgres://u:TOPSECRET@host:0/db',
            'postgres://u:TOPSECRET@host:99999/db', 'postgres://u:TOPSECRET@host:x/db',
            'postgres://u:TOPSECRET@host/db/extra', 'postgres://u:TOPSECRET@/db',
            'postgres://u:TOPSECRET %@host/db', 'postgres://u:TOPSECRET%xx@host/db',
            'postgres://u:TOPSECRET%00@host/db', 'postgres://u:TOPSECRET@[broken/db',
        ]
        for url in urls:
            with self.subTest(url=url), self.assertRaises(ImproperlyConfigured) as result:
                database_config({'DATABASE_URL': url})
            self.assertNotIn('TOPSECRET', str(result.exception))

    def test_query_options_cannot_override_host_or_schema_or_duplicate(self):
        for query in ('sslmode=require&sslmode=disable', 'host=elsewhere', 'options=-c%20search_path=public',
                      'sslmode=', 'anything', 'connect_timeout=0', 'connect_timeout=TOPSECRET'):
            with self.subTest(query=query), self.assertRaises(ImproperlyConfigured) as result:
                database_config({'DATABASE_URL': f'postgres://u:p@host/db?{query}'})
            self.assertNotIn('TOPSECRET', str(result.exception))

    def test_supabase_rejects_unencrypted_connections_public_schema_and_transaction_pooler(self):
        for extra in ({'DB_SSLMODE': 'disable'}, {'DB_SSLMODE': 'prefer'}, {'DB_SCHEMA': 'public'},
                      {'DB_SCHEMA': 'auth'}, {'DB_SCHEMA': 'pg_catalog'}, {'DB_PORT': '6543'}):
            with self.subTest(extra=extra), self.assertRaises(ImproperlyConfigured):
                database_config({'DB_HOST': 'db.project.supabase.co', **extra})

    def test_schema_is_a_single_safe_identifier(self):
        for schema in ('first,public', 'schema; DROP SCHEMA public', '-c statement_timeout=0', 'x' * 64):
            with self.subTest(schema=schema), self.assertRaises(ImproperlyConfigured):
                database_config({'DB_SCHEMA': schema})

    def test_process_environment_then_backend_then_root_precedence(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {}, clear=True):
            root = Path(folder)
            backend = root / 'BackEnd'
            backend.mkdir()
            (root / '.env').write_text('DB_NAME=root\nDB_USER=root-user\nPOSTGRES_DB=root-fallback\n')
            (backend / '.env').write_text('DB_NAME=backend\nDB_USER=backend-user\n')
            os.environ['DB_NAME'] = 'process'
            load_environment(backend)
            self.assertEqual(os.environ['DB_NAME'], 'process')
            self.assertEqual(os.environ['DB_USER'], 'backend-user')
            self.assertEqual(os.environ['POSTGRES_DB'], 'root-fallback')

    def test_disabled_environment_files_do_not_load_database_or_provider_credentials(self):
        process = {'DJANGO_LOAD_ENV_FILES': ' FALSE ', 'DB_HOST': 'db', 'GROQ_API_KEY': 'explicit-test-key'}
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, process, clear=True):
            root = Path(folder)
            backend = root / 'BackEnd'
            backend.mkdir()
            (root / '.env').write_text('DATABASE_URL=postgres://u:p@remote.test/db\nSTRIPE_SECRET_KEY=root-test-key\n')
            (backend / '.env').write_text('DB_SCHEMA=remote\nRESEND_API_KEY=backend-test-key\nGROQ_API_KEY=backend-test-key\n')

            load_environment(backend)

            self.assertEqual(dict(os.environ), process)

    def test_explicit_true_keeps_environment_file_loading(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'DJANGO_LOAD_ENV_FILES': 'true'}, clear=True):
            root = Path(folder)
            backend = root / 'BackEnd'
            backend.mkdir()
            (root / '.env').write_text('DB_NAME=local\n')

            load_environment(backend)

            self.assertEqual(os.environ['DB_NAME'], 'local')

    def test_invalid_environment_file_flag_fails_without_echoing_its_value(self):
        with patch.dict(os.environ, {'DJANGO_LOAD_ENV_FILES': 'invalid-test-value'}, clear=True):
            with self.assertRaisesRegex(ImproperlyConfigured, '^DJANGO_LOAD_ENV_FILES must be true or false\\.$'):
                load_environment('/unused')

    def test_explicit_local_blanks_block_hosted_database_fallbacks(self):
        local = {
            'DATABASE_URL': '', 'DB_SCHEMA': '', 'DB_SSLMODE': 'disable',
            'DB_SSLROOTCERT': '', 'DB_HOST': 'db',
        }
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, local, clear=True):
            root = Path(folder)
            backend = root / 'BackEnd'
            backend.mkdir()
            (backend / '.env').write_text(
                'DATABASE_URL=postgres://u:p@db.project.supabase.co/postgres\n'
                'DB_SCHEMA=frota_rural\nDB_SSLMODE=verify-full\nDB_SSLROOTCERT=/remote/ca.crt\n'
            )

            load_environment(backend)
            config = database_config()

            self.assertEqual(config['HOST'], 'db')
            self.assertEqual(config['OPTIONS']['sslmode'], 'disable')
            self.assertNotIn('options', config['OPTIONS'])
            self.assertNotIn('sslrootcert', config['OPTIONS'])


if __name__ == '__main__':
    unittest.main()
