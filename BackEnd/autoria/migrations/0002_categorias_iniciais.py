from django.db import migrations


REGISTROS = (
    ("11111111-1111-4111-8111-111111111111", "Masculino"),
    ("22222222-2222-4222-8222-222222222222", "Feminino"),
    ("33333333-3333-4333-8333-333333333333", "Indefinido"),
)


def inserir(apps, schema_editor):
    Categoria = apps.get_model("autoria", "CategoriaAutoria")
    for identificador, Genero in REGISTROS:
        Categoria.objects.using(schema_editor.connection.alias).get_or_create(
            pk=identificador, defaults={"Genero": Genero},
        )


def remover(apps, schema_editor):
    Categoria = apps.get_model("autoria", "CategoriaAutoria")
    Categoria.objects.using(schema_editor.connection.alias).filter(
        pk__in=[identificador for identificador, _ in REGISTROS],
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("autoria", "0001_initial")]
    operations = [migrations.RunPython(inserir, remover)]
