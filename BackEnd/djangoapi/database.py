"""PostgreSQL configuration shared by local Docker and hosted databases."""

import os
import re
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv


def load_environment(base_dir):
    """Process variables win, followed by BackEnd/.env, then the root .env."""
    base_dir = Path(base_dir)
    load_dotenv(base_dir / '.env', override=False)
    load_dotenv(base_dir.parent / '.env', override=False)


def is_supabase_host(host):
    host = host.lower().rstrip('.')
    return host.endswith('.supabase.co') or host.endswith('.pooler.supabase.com')


def _integer(value, name, minimum, maximum):
    try:
        result = int(value)
        if minimum <= result <= maximum:
            return result
    except (ValueError, TypeError):
        pass
    raise ImproperlyConfigured(f'{name} must be an integer from {minimum} to {maximum}.')


def database_config(environ=None):
    env = os.environ if environ is None else environ
    url = env.get('DATABASE_URL', '').strip()
    options = {}
    if url:
        # Never include the supplied URL or a parser exception in error output.
        try:
            parsed = urlsplit(url)
            port = parsed.port if parsed.port is not None else 5432
            valid = (
                parsed.scheme in {'postgres', 'postgresql'}
                and parsed.hostname and parsed.username and parsed.path.startswith('/')
                and parsed.path[1:] and '/' not in parsed.path[1:]
                and 1 <= port <= 65535
                and not parsed.fragment and not any(char.isspace() for char in url)
                and not re.search(r'%(?![0-9a-fA-F]{2})', url)
                and '\x00' not in unquote(url)
            )
            pairs = parse_qsl(parsed.query, strict_parsing=True, keep_blank_values=True)
            if not valid:
                raise ValueError
        except (ValueError, TypeError):
            raise ImproperlyConfigured(
                'DATABASE_URL must be a PostgreSQL URL with host, user and database; '
                'percent-encode reserved characters in the password.'
            ) from None
        allowed = {'sslmode', 'sslrootcert', 'connect_timeout', 'application_name'}
        if any(key not in allowed or not value for key, value in pairs) or len(dict(pairs)) != len(pairs):
            raise ImproperlyConfigured(
                'DATABASE_URL has unsupported, empty or duplicate query parameters. '
                'Supported: sslmode, sslrootcert, connect_timeout, application_name; use DB_SCHEMA for the schema.'
            )
        options.update(pairs)
        config = {
            'NAME': unquote(parsed.path[1:]),
            'USER': unquote(parsed.username),
            'PASSWORD': unquote(parsed.password or ''),
            'HOST': parsed.hostname,
            'PORT': str(port),
        }
    else:
        config = {
            'NAME': env.get('DB_NAME', env.get('POSTGRES_DB', 'frota_rural')),
            'USER': env.get('DB_USER', env.get('POSTGRES_USER', 'postgres')),
            'PASSWORD': env.get('DB_PASSWORD', env.get('POSTGRES_PASSWORD', '')),
            'HOST': env.get('DB_HOST', 'localhost'),
            'PORT': str(_integer(env.get('DB_PORT', env.get('POSTGRES_PORT', '5432')), 'DB_PORT / POSTGRES_PORT', 1, 65535)),
        }
    supabase = is_supabase_host(config['HOST'])
    if supabase and config['PORT'] == '6543':
        raise ImproperlyConfigured(
            'Use the Supabase session pooler or direct connection on port 5432; '
            'transaction pooling is not supported by this configuration.'
        )
    sslmode = options.get('sslmode') or env.get('DB_SSLMODE') or ('require' if supabase else '')
    if sslmode:
        if sslmode not in {'disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'}:
            raise ImproperlyConfigured('DB_SSLMODE / sslmode is invalid.')
        if supabase and sslmode not in {'require', 'verify-ca', 'verify-full'}:
            raise ImproperlyConfigured('Supabase requires sslmode=require or certificate verification.')
        options['sslmode'] = sslmode
    rootcert = options.get('sslrootcert') or env.get('DB_SSLROOTCERT')
    if rootcert:
        options['sslrootcert'] = rootcert
    options['connect_timeout'] = _integer(
        options.get('connect_timeout', env.get('DB_CONNECT_TIMEOUT', '10')),
        'DB_CONNECT_TIMEOUT / connect_timeout', 1, 300,
    )

    schema = env.get('DB_SCHEMA') or ('frota_rural' if supabase else '')
    if schema:
        if not re.fullmatch(r'[a-z_][a-z0-9_]{0,62}', schema):
            raise ImproperlyConfigured('DB_SCHEMA must be a lowercase PostgreSQL identifier of at most 63 characters.')
        if supabase and (schema in {'public', 'auth', 'storage', 'extensions', 'information_schema'} or schema.startswith('pg_')):
            raise ImproperlyConfigured('Use a dedicated non-public DB_SCHEMA for Django on Supabase, such as frota_rural.')
        # No public fallback: an absent schema must fail rather than create exposed tables.
        options['options'] = f'-c search_path={schema}'
    config.update(ENGINE='django.db.backends.postgresql', OPTIONS=options, CONN_MAX_AGE=0)
    return config
