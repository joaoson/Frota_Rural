from django.db import migrations

TIPOS_VINCULO = [
    ("8a3dac70-0000-4000-8000-000000000001", "CLT"),
    ("8a3dac70-0000-4000-8000-000000000002", "Autônomo"),
    ("8a3dac70-0000-4000-8000-000000000003", "Diarista"),
]


def inserir_tipos(apps, schema_editor):
    TipoVinculo = apps.get_model("document_validation", "TipoVinculo")
    for id_, nome in TIPOS_VINCULO:
        TipoVinculo.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_tipos(apps, schema_editor):
    TipoVinculo = apps.get_model("document_validation", "TipoVinculo")
    TipoVinculo.objects.filter(id__in=[id_ for id_, _ in TIPOS_VINCULO]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("document_validation", "0013_tipovinculo_operatorlicense_tipo_vinculo"),
    ]

    operations = [
        migrations.RunPython(inserir_tipos, remover_tipos),
    ]
