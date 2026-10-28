"""Read-only connection verification without printing credentials or rows."""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from djangoapi.database import is_supabase_host


class Command(BaseCommand):
    help = 'Verify the configured PostgreSQL connection, TLS and schema without changing data.'
    requires_system_checks = []

    def handle(self, *args, **options):
        config = connection.settings_dict
        db_options = config.get('OPTIONS', {})
        schema_option = db_options.get('options', '')
        schema = schema_option.removeprefix('-c search_path=') or None
        self.stdout.write(f"Host: {config['HOST']}:{config['PORT']}")
        self.stdout.write(f"Database: {config['NAME']}")
        self.stdout.write(f"SSL mode: {db_options.get('sslmode', 'driver default')}")
        self.stdout.write(f"Schema: {schema or 'PostgreSQL default'}")
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT current_database(), current_schema()')
                actual_database, actual_schema = cursor.fetchone()
                ssl_in_use = bool(connection.connection.pgconn.ssl_in_use)
                if schema:
                    cursor.execute(
                        'SELECT has_schema_privilege(current_user, oid, \'USAGE\'), '
                        'has_schema_privilege(current_user, oid, \'CREATE\') '
                        'FROM pg_namespace WHERE nspname = %s', [schema],
                    )
                    privileges = cursor.fetchone()
                    if not privileges or actual_schema != schema or not all(privileges):
                        raise CommandError(
                            'The configured schema is missing or lacks USAGE/CREATE permissions. '
                            'Prepare it explicitly before running migrations; see Devops/SUPABASE.md.'
                        )
        except CommandError:
            raise
        except Exception:
            # Driver messages can contain a DSN or credentials. Keep diagnosis safe.
            raise CommandError(
                'Database verification failed. Check the host, database password, network access '
                'and SSL certificate settings locally. Credentials were not printed.'
            ) from None
        if is_supabase_host(config['HOST']) and not ssl_in_use:
            raise CommandError('The Supabase connection is not encrypted.')
        self.stdout.write(self.style.SUCCESS(
            f'Connection OK: database={actual_database}, schema={actual_schema}, '
            f'TLS={"enabled" if ssl_in_use else "disabled"}.'
        ))
