"""Repeatable demonstration data: inspect ``python seed.py --dry-run`` first.

Existing records are never updated or deleted. No mail, payment request or
signature evidence is created. A remote write requires --allow-remote.
"""
import argparse
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
import os
import uuid

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'djangoapi.settings')
django.setup()

from django.contrib.auth.hashers import make_password
from django.core.exceptions import ImproperlyConfigured
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone

from api.models import Rentals, Reviews
from chat.models import Messages
from contracts.models import Contracts
from document_validation.models import Certification
from machines.models import Machines
from notifications.events import notify_rental_event
from notifications.models import Notification
from payments.pricing import calcular_total
from postings.models import Postings
from users.models import Users

DEFAULT_PASSWORD = 'Teste1234'
SEED_NAMESPACE = uuid.UUID('7ff6ec7c-31c4-4cb8-a751-95a718f6b956')


class SeedConflict(ValueError):
    """An unrelated record owns a fixture's unique value."""


def seed_id(kind, index):
    return uuid.uuid5(SEED_NAMESPACE, f'{kind}:{index}')


USERS = (
    ('João Silva', 'joao.silva@example.test', 'locador'),
    ('Maria Oliveira', 'maria.oliveira@example.test', 'locatario'),
    ('Carlos Santos', 'carlos.santos@example.test', 'operador'),
    ('Ana Pereira', 'ana.pereira@example.test', 'locador'),
    ('Pedro Costa', 'pedro.costa@example.test', 'locatario'),
    ('Fernanda Lima', 'fernanda.lima@example.test', 'operador'),
)
MACHINES = (
    ('John Deere', '8R 410', 2022, 'Plantio e cultivo', 410),
    ('Case IH', 'Magnum 380', 2021, 'Preparo de solo', 380),
    ('New Holland', 'T7.315', 2023, 'Colheita', 315),
    ('Massey Ferguson', 'MF 8737', 2020, 'Plantio e cultivo', 370),
    ('Valtra', 'BH 224', 2022, 'Preparo de solo', 224),
    ('John Deere', '6155J', 2021, 'Pulverização', 155),
    ('Case IH', 'Axial-Flow 8250', 2023, 'Colheita', 460),
    ('New Holland', 'CR 10.90', 2022, 'Colheita', 653),
    ('Massey Ferguson', 'MF 4292', 2019, 'Plantio e cultivo', 90),
    ('Valtra', 'A134', 2020, 'Preparo de solo', 134),
    ('John Deere', 'S790', 2023, 'Colheita', 543),
    ('Case IH', 'Farmall 80', 2021, 'Plantio e cultivo', 80),
    ('New Holland', 'TL 75E', 2020, 'Pulverização', 75),
    ('Massey Ferguson', 'MF 6713', 2022, 'Preparo de solo', 132),
    ('Valtra', 'BT 210', 2021, 'Plantio e cultivo', 210),
    ('John Deere', '5090E', 2019, 'Pulverização', 90),
    ('Case IH', 'Puma 185', 2022, 'Preparo de solo', 185),
    ('New Holland', 'T6.180', 2023, 'Plantio e cultivo', 180),
    ('Massey Ferguson', 'MF 9895', 2021, 'Colheita', 500),
    ('Valtra', 'BH 194', 2020, 'Preparo de solo', 194),
)
LOCATIONS = (
    ('Curitiba, PR', '-25.42780000', '-49.27310000', '80010000'),
    ('Londrina, PR', '-23.31040000', '-51.16280000', '86010000'),
    ('Ribeirão Preto, SP', '-21.17860000', '-47.81030000', '14010000'),
    ('Goiânia, GO', '-16.68690000', '-49.26480000', '74000000'),
)


def build_plan(now=None):
    """Date defaults apply only to missing records, never to a rerun's history."""
    now = now or timezone.now()
    day = timezone.localtime(now).replace(hour=8, minute=0, second=0, microsecond=0)
    plan = []

    def add(model_class, kind, index, **defaults):
        pk = seed_id(kind, index)
        plan.append((model_class, pk, defaults))
        return pk

    for i, (name, email, role) in enumerate(USERS):
        add(Users, 'user', i, name=f'{name} (demo)', email=email,
            document=f'DEMO-USER-{i + 1:02d}', role=role, status='active',
            phone=f'(41) 90000-{i + 1:04d}', address=f'Rua Demonstração, {100 + i}',
            city='Curitiba', state='PR', cep='80010-000', birth_date=date(1985 + i, 3, 15),
            employer_id=seed_id('user', 1 if i == 2 else 4) if role == 'operador' else None)

    for i, user_index in enumerate((2, 5)):
        add(Certification, 'certification', i, user_id=seed_id('user', user_index),
            issuing_organization='Instituição de demonstração',
            title='Operação de máquinas agrícolas (demo)', issue_date=day.date() - timedelta(days=180),
            description='Certificado fictício para explorar a plataforma. Sem validade profissional.',
            validation_status='pending', created_at=now, updated_at=now)

    for i, (brand, model, year, purpose, power) in enumerate(MACHINES):
        machinery_id = add(Machines, 'machine', i, owner_id=seed_id('user', 0 if i % 2 == 0 else 3),
            renagro_number=f'BR{9900000000 + i:010d}', brand=brand, model=model, year=year,
            power_cv=power, hour_meter=max(0, now.year - year) * 700 + i * 25,
            hour_meter_updated_at=now, technical_specifications=f'Equipamento de demonstração: {brand} {model}.',
            usage_purpose=purpose, status='active', created_at=now, updated_at=now)
        address, lat, lng, cep = LOCATIONS[i % len(LOCATIONS)]
        add(Postings, 'posting', i, machinery_id=machinery_id,
            hourly_rate=Decimal(150 + i * 25), location_lat=Decimal(lat), location_lng=Decimal(lng),
            location_address=address, location_cep=cep,
            availability_start=day - timedelta(days=90), availability_end=day + timedelta(days=730),
            max_reservation_days=14,
            description=f'Anúncio de demonstração — {brand} {model} em {address}. Equipamento fictício para testar a plataforma.',
            status='active', created_at=now, updated_at=now)

    for i in range(8):
        historical, cancelled = i < 4, i >= 6
        rental_status = 'completed' if historical else 'cancelled' if cancelled else 'pending'
        offset = -45 + i * 5 if historical or cancelled else 14 + (i - 4) * 7
        start = day + timedelta(days=offset)
        end = start + timedelta(days=1, hours=9)
        price = calcular_total(Rentals(start_date=start, end_date=end,
            postings=Postings(hourly_rate=Decimal(150 + i * 25))))
        renter_id = seed_id('user', 1 if i % 2 == 0 else 4)
        rental_id = add(Rentals, 'rental', i, postings_id=seed_id('posting', i), lessee_id=renter_id,
            operator_id=seed_id('user', 2 if i % 2 == 0 else 5), start_date=start, end_date=end,
            total_price=price, initial_hour_meter=1000 + i * 50 if historical else None,
            final_hour_meter=1016 + i * 50 if historical else None, status=rental_status,
            reservation_expires_at=now + timedelta(minutes=30) if rental_status == 'pending' else None,
            created_at=start - timedelta(days=3) if historical or cancelled else now, updated_at=now)
        # Historical examples have no invented legal evidence or fake payments.
        if not historical:
            add(Contracts, 'contract', i, rental_id=rental_id, document_url=None,
                accepted_by_lessor=False, accepted_by_lessee=False,
                status='cancelled' if cancelled else 'pending_signatures', created_at=now)
        add(Messages, 'message', i, rental_id=rental_id, sender_id=renter_id,
            receiver_id=seed_id('user', 0 if i % 2 == 0 else 3),
            content='Conversa de demonstração: obrigado pelo atendimento!' if historical else 'Conversa de demonstração: gostaria de combinar a retirada da máquina.',
            sent_at=end + timedelta(hours=1) if historical else now, flagged_for_moderation=False)
        if historical:
            add(Reviews, 'review', i, rental_id=rental_id, reviewer_id=renter_id,
                reviewee_id=seed_id('user', 0 if i % 2 == 0 else 3), rating=4 + i % 2,
                comment='Avaliação de demonstração: equipamento em boas condições e atendimento pontual.',
                created_at=end + timedelta(days=1))
    return plan


def _check_conflicts(plan):
    for model, pk, defaults in plan:
        if model is Users:
            duplicate = model.objects.exclude(pk=pk).filter(
                Q(email__iexact=defaults['email']) | Q(document=defaults['document'])
            ).exists()
        elif model is Machines:
            duplicate = model.objects.exclude(pk=pk).filter(renagro_number=defaults['renagro_number']).exists()
        else:
            duplicate = False
        if duplicate:
            raise SeedConflict(
                f'Seed interrompido: valor único de {model._meta.label} já pertence a outro registro. '
                'Nenhum dado foi alterado. Não reutilize contas reais para a demonstração.'
            )


def seed_database(*, dry_run=False, allow_remote=False, now=None):
    host = str(connection.settings_dict.get('HOST', '')).lower()
    if not dry_run and not allow_remote and host not in {'', 'localhost', '127.0.0.1', '::1', 'db'}:
        raise ImproperlyConfigured('Banco remoto: revise --dry-run e use --allow-remote para inserir os dados de demonstração.')
    plan = build_plan(now)
    created, existing = Counter(), Counter()
    new_rentals = set()
    with transaction.atomic():
        # Serialize concurrent runs without a separate seed metadata table.
        if not dry_run and connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(%s)', [711563019462101])
        _check_conflicts(plan)
        password_hash = None
        for model, pk, defaults in plan:
            label = model._meta.db_table
            if model.objects.filter(pk=pk).exists():
                existing[label] += 1
                continue
            created[label] += 1
            if dry_run:
                continue
            if model is Users:
                if password_hash is None:
                    password_hash = make_password(os.environ.get('SEED_DEMO_PASSWORD', DEFAULT_PASSWORD))
                defaults = {**defaults, 'password': password_hash}
            model.objects.create(pk=pk, **defaults)
            if model is Rentals:
                new_rentals.add(pk)
        for i in range(8):
            rental_pk = seed_id('rental', i)
            event_key = f'seed:demo:v1:{rental_pk}'
            present = Notification.objects.filter(event_key=event_key).count()
            existing['notifications'] += present
            # Only new rentals get new seed events. Re-running the fixture must
            # not announce an old status after someone has used the demo.
            was_present = Rentals.objects.filter(pk=rental_pk).exists() if dry_run else rental_pk not in new_rentals
            if was_present:
                continue
            created['notifications'] += 2
            if not dry_run:
                event = 'rental_completed' if i < 4 else 'rental_cancelled' if i >= 6 else 'rental_created'
                rental = Rentals.objects.select_related('postings__machinery').get(pk=rental_pk)
                notify_rental_event(rental, event, event_key=event_key)
    return {'created': dict(created), 'existing': dict(existing), 'dry_run': dry_run}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='Mostra contagens sem gravar nada.')
    parser.add_argument('--allow-remote', action='store_true', help='Autoriza explicitamente inserir demos no banco remoto configurado.')
    args = parser.parse_args(argv)
    try:
        result = seed_database(dry_run=args.dry_run, allow_remote=args.allow_remote)
    except (SeedConflict, ImproperlyConfigured) as exc:
        parser.exit(1, f'{exc}\n')
    action = 'A criar' if args.dry_run else 'Criados'
    for table in sorted(set(result['created']) | set(result['existing'])):
        print(f"{table}: {action.lower()} {result['created'].get(table, 0)}; preservados {result['existing'].get(table, 0)}")
    print('Demonstração: joao.silva@example.test (locador); maria.oliveira@example.test (locatário).')
    print('Senha inicial: SEED_DEMO_PASSWORD, se definida, ou a senha documentada em Devops/SEED.md. Senhas existentes são preservadas.')


if __name__ == '__main__':
    main()
