from django.db import migrations

FUNCOES = [
    ("5d0a7f40-0000-4000-8000-000000000001", "Tratorista"),
    ("5d0a7f40-0000-4000-8000-000000000002", "Operador de colheitadeira"),
    ("5d0a7f40-0000-4000-8000-000000000003", "Operador de pulverizador"),
]


def inserir_funcoes(apps, schema_editor):
    FuncaoOperador = apps.get_model("users", "FuncaoOperador")
    for id_, nome in FUNCOES:
        FuncaoOperador.objects.update_or_create(id=id_, defaults={"nome": nome})


def remover_funcoes(apps, schema_editor):
    FuncaoOperador = apps.get_model("users", "FuncaoOperador")
    FuncaoOperador.objects.filter(id__in=[id_ for id_, _ in FUNCOES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0009_funcaooperador_users_funcao_operador"),
    ]

    operations = [
        migrations.RunPython(inserir_funcoes, remover_funcoes),
    ]
