# Criar a tabela e os três registros

## 1 Ambiente local

Para usar um banco exclusivo de ensaio, começar pelo [guia do ambiente](05_ambiente_dev_e_banco_isolado.md). Ele também mostra a substituição dos comandos abaixo quando Django roda diretamente no terminal.

```bash
# Na raiz do repositório. Preserva o ambiente escolhido no guia de preparação.
export AUTORIA_BACKEND=${AUTORIA_BACKEND:-frota-local-715856fc-backend-1}
export AUTORIA_API=${AUTORIA_API:-http://localhost:8002/api}
docker exec "$AUTORIA_BACKEND" python manage.py verify_database
docker exec "$AUTORIA_BACKEND" python manage.py showmigrations
docker exec "$AUTORIA_BACKEND" python manage.py startapp autoria
```

## 2 Registrar o app

`BackEnd/djangoapi/settings.py` — acrescentar em `INSTALLED_APPS`:

```python
    "autoria",
```

## 3 Modelo da tabela nova

<!-- file: BackEnd/autoria/models.py -->
```python
import uuid
from django.db import models


class CategoriaAutoria(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "categorias_autoria"
        ordering = ["nome"]

    def __str__(self):
        return self.nome
```

```bash
# Execute antes de adicionar a FK no modelo existente.
docker exec "$AUTORIA_BACKEND" python manage.py makemigrations autoria
# Resultado esperado para um app novo: autoria/migrations/0001_initial.py.
```

## 4 Migration dos três registros

<!-- file: BackEnd/autoria/migrations/0002_categorias_iniciais.py -->
```python
from django.db import migrations


REGISTROS = (
    ("11111111-1111-4111-8111-111111111111", "Rotina"),
    ("22222222-2222-4222-8222-222222222222", "Acompanhamento"),
    ("33333333-3333-4333-8333-333333333333", "Prioridade"),
)


def inserir(apps, schema_editor):
    Categoria = apps.get_model("autoria", "CategoriaAutoria")
    for identificador, nome in REGISTROS:
        Categoria.objects.using(schema_editor.connection.alias).get_or_create(
            pk=identificador, defaults={"nome": nome},
        )


def remover(apps, schema_editor):
    Categoria = apps.get_model("autoria", "CategoriaAutoria")
    Categoria.objects.using(schema_editor.connection.alias).filter(
        pk__in=[identificador for identificador, _ in REGISTROS],
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("autoria", "0001_initial")]
    operations = [migrations.RunPython(inserir, remover)]
```

```bash
docker exec "$AUTORIA_BACKEND" python manage.py migrate --plan
docker exec "$AUTORIA_BACKEND" python manage.py migrate
docker exec "$AUTORIA_BACKEND" python manage.py shell -c 'from autoria.models import CategoriaAutoria; print(list(CategoriaAutoria.objects.values("id", "nome")))'
```

```sql
SELECT id, nome FROM categorias_autoria ORDER BY nome;
-- 3 linhas: Acompanhamento, Prioridade, Rotina.
```

## 5 Relacionar uma tabela existente

Escolha **um** arquivo em [modelos](README.md#modelos). Todos usam a mesma tabela nova.

```python
# Inserir DENTRO da classe do modelo escolhido, antes de class Meta.
# Não substituir a classe nem seus campos existentes.
categoria_autoria = models.ForeignKey(
    "autoria.CategoriaAutoria",
    on_delete=models.PROTECT,
    null=True,       # Registros antigos continuam válidos.
    blank=True,
    related_name="+",
)
```

```text
Python: registro.categoria_autoria      -> objeto CategoriaAutoria
Python: registro.categoria_autoria_id   -> UUID gravado
SQL:    tabela.categoria_autoria_id     -> FK para categorias_autoria.id
API:    categoria_id                   -> UUID recebido pelo novo endpoint
API:    categoria_nome                 -> nome lido do relacionamento no banco
```

## 6 Alterar o enunciado

```text
Se pedirem departamentos: CategoriaAutoria -> Departamento; nomes -> 3 departamentos.
Se pedirem tipos:        CategoriaAutoria -> Tipo; nomes -> 3 tipos.
Se pedirem setores:     CategoriaAutoria -> Setor; nomes -> 3 setores.

Renomear junto: classe, ForeignKey, migration, serializer, service, URL e componente.
Não usar CharField com o nome da opção no lugar da FK pedida.
```
