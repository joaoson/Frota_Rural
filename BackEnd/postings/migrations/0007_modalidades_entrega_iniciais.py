from django.db import migrations

MODALIDADES = [
    ("2a7d4c10-0000-4000-8000-000000000001", "Retirada no local"),
    ("2a7d4c10-0000-4000-8000-000000000002", "Entrega pelo locador"),
    ("2a7d4c10-0000-4000-8000-000000000003", "Entrega a combinar"),
]


def inserir_modalidades(apps, schema_editor):
    ModalidadeEntrega = apps.get_model("postings", "ModalidadeEntrega")
    for id_, nome in MODALIDADES:
        ModalidadeEntrega.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_modalidades(apps, schema_editor):
    ModalidadeEntrega = apps.get_model("postings", "ModalidadeEntrega")
    ModalidadeEntrega.objects.filter(id__in=[id_ for id_, _ in MODALIDADES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("postings", "0006_modalidadeentrega_postings_modalidade_entrega"),
    ]

    operations = [
        migrations.RunPython(inserir_modalidades, remover_modalidades),
    ]
