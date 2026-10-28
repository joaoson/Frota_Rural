from django.db import migrations

TIPOS_CULTURA = [
    ("3b8e5d20-0000-4000-8000-000000000001", "Soja"),
    ("3b8e5d20-0000-4000-8000-000000000002", "Milho"),
    ("3b8e5d20-0000-4000-8000-000000000003", "Trigo"),
]


def inserir_tipos(apps, schema_editor):
    TipoCultura = apps.get_model("rentals", "TipoCultura")
    for id_, nome in TIPOS_CULTURA:
        TipoCultura.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_tipos(apps, schema_editor):
    TipoCultura = apps.get_model("rentals", "TipoCultura")
    TipoCultura.objects.filter(id__in=[id_ for id_, _ in TIPOS_CULTURA]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("rentals", "0008_tipocultura_rentals_tipo_cultura"),
    ]

    operations = [
        migrations.RunPython(inserir_tipos, remover_tipos),
    ]
