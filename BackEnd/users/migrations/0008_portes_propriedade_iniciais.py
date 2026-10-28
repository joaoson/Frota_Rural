from django.db import migrations

PORTES = [
    ("4c9f6e30-0000-4000-8000-000000000001", "Pequena"),
    ("4c9f6e30-0000-4000-8000-000000000002", "Média"),
    ("4c9f6e30-0000-4000-8000-000000000003", "Grande"),
]


def inserir_portes(apps, schema_editor):
    PortePropriedade = apps.get_model("users", "PortePropriedade")
    for id_, nome in PORTES:
        PortePropriedade.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_portes(apps, schema_editor):
    PortePropriedade = apps.get_model("users", "PortePropriedade")
    PortePropriedade.objects.filter(id__in=[id_ for id_, _ in PORTES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0007_portepropriedade_users_porte_propriedade"),
    ]

    operations = [
        migrations.RunPython(inserir_portes, remover_portes),
    ]
