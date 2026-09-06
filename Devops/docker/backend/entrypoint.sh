#!/bin/sh
set -eu

python manage.py migrate --noinput

# Em dev, `runserver` ja e ASGI (o app `daphne` vem primeiro em INSTALLED_APPS e
# substitui o comando) e mantem o autoreload que o bind mount espera. O
# runserver do Django 6.0 sozinho ainda e WSGI-only. Em producao, Daphne direto.
if [ "${DJANGO_SERVER_MODE:-dev}" = "asgi" ]; then
    exec daphne -b 0.0.0.0 -p 8000 djangoapi.asgi:application
fi

exec python manage.py runserver 0.0.0.0:8000
