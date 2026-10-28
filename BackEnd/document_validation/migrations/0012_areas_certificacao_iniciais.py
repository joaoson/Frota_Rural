from django.db import migrations

AREAS = [
    ("7f2c9b60-0000-4000-8000-000000000001", "Operação de máquinas"),
    ("7f2c9b60-0000-4000-8000-000000000002", "Segurança do trabalho (NR-31)"),
    ("7f2c9b60-0000-4000-8000-000000000003", "Manutenção mecânica"),
]


def inserir_areas(apps, schema_editor):
    AreaCertificacao = apps.get_model("document_validation", "AreaCertificacao")
    for id_, nome in AREAS:
        AreaCertificacao.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_areas(apps, schema_editor):
    AreaCertificacao = apps.get_model("document_validation", "AreaCertificacao")
    AreaCertificacao.objects.filter(id__in=[id_ for id_, _ in AREAS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("document_validation", "0011_areacertificacao_certification_area"),
    ]

    operations = [
        migrations.RunPython(inserir_areas, remover_areas),
    ]
