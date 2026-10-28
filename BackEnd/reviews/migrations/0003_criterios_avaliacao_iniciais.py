from django.db import migrations

CRITERIOS = [
    ("6e1b8a50-0000-4000-8000-000000000001", "Pontualidade"),
    ("6e1b8a50-0000-4000-8000-000000000002", "Conservação da máquina"),
    ("6e1b8a50-0000-4000-8000-000000000003", "Comunicação"),
]


def inserir_criterios(apps, schema_editor):
    CriterioAvaliacao = apps.get_model("reviews", "CriterioAvaliacao")
    for id_, nome in CRITERIOS:
        CriterioAvaliacao.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_criterios(apps, schema_editor):
    CriterioAvaliacao = apps.get_model("reviews", "CriterioAvaliacao")
    CriterioAvaliacao.objects.filter(id__in=[id_ for id_, _ in CRITERIOS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("reviews", "0002_criterioavaliacao_reviews_criterio"),
    ]

    operations = [
        migrations.RunPython(inserir_criterios, remover_criterios),
    ]
