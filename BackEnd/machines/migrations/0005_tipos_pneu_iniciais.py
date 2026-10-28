from django.db import migrations

TIPOS_PNEU = [
    ("1f0c2b8e-0000-4000-8000-000000000001", "Radial"),
    ("1f0c2b8e-0000-4000-8000-000000000002", "Diagonal"),
    ("1f0c2b8e-0000-4000-8000-000000000003", "Alta flutuação"),
]


def inserir_tipos(apps, schema_editor):
    TipoPneu = apps.get_model("machines", "TipoPneu")
    for id_, nome in TIPOS_PNEU:
        TipoPneu.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_tipos(apps, schema_editor):
    TipoPneu = apps.get_model("machines", "TipoPneu")
    TipoPneu.objects.filter(id__in=[id_ for id_, _ in TIPOS_PNEU]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("machines", "0004_tipopneu_machines_tipo_pneu"),
    ]

    operations = [
        migrations.RunPython(inserir_tipos, remover_tipos),
    ]
