# Tabela e três registros

Seu ensaio já chegou ao passo 5. Não repetir `startapp`, não apagar migrations e não recriar o banco.

## 1 Ambiente


```bash
# Terminal em BackEnd/
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural_autoria
```

## 2 Modelo utilizado neste ensaio

`BackEnd/autoria/models.py` — estado atual; manter os nomes para continuar:


```python
class Genero(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    Genero = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "Genero"
        ordering = ["Genero"]

    def __str__(self):
        return self.Genero
```

Imports: `import uuid` e `from django.db import models`. App `"autoria"` já registrado em `INSTALLED_APPS`.

## 3 Conferir o que já foi aplicado


```bash
python manage.py showmigrations autoria users
python manage.py makemigrations --check --dry-run
python manage.py shell -c 'from autoria.models import Genero; print(list(Genero.objects.values("id", "Genero")))'
```

```text
11111111-1111-4111-8111-111111111111 → Masculino
22222222-2222-4222-8222-222222222222 → Feminino
33333333-3333-4333-8333-333333333333 → Indefinido
```

## 4 Se precisar criar OUTRA tabela na defesa

Criar o novo modelo, gerar sua migration e depois uma migration de dados:


```bash
python manage.py makemigrations autoria
python manage.py makemigrations autoria --empty --name registros_iniciais_nova_tabela
```

Na migration vazia, manter a dependência gerada. Exemplo do corpo para um modelo `Departamento` com campo `nome`:


```python
REGISTROS = (
    ("11111111-1111-4111-8111-111111111111", "Operações"),
    ("22222222-2222-4222-8222-222222222222", "Manutenção"),
    ("33333333-3333-4333-8333-333333333333", "Administrativo"),
)

def inserir(apps, schema_editor):
    Modelo = apps.get_model("autoria", "Departamento")
    for pk, nome in REGISTROS:
        Modelo.objects.using(schema_editor.connection.alias).get_or_create(
            pk=pk, defaults={"nome": nome},
        )

def remover(apps, schema_editor):
    Modelo = apps.get_model("autoria", "Departamento")
    Modelo.objects.using(schema_editor.connection.alias).filter(
        pk__in=[pk for pk, _ in REGISTROS],
    ).delete()

# Dentro de Migration; preservar dependencies:
operations = [migrations.RunPython(inserir, remover)]
```

## 5 FK no modelo existente

Para o ensaio atual, inserir dentro da classe escolhida, imediatamente antes de `class Meta`. **Em `Users` já existe; não duplicar.**


```python
categoria_autoria = models.ForeignKey(
    "autoria.Genero",
    on_delete=models.PROTECT,
    null=True,
    blank=True,
    related_name="+",
)
```

```bash
# Exemplo: users; trocar pelo app do modelo escolhido.
python manage.py makemigrations users
python manage.py migrate --plan
python manage.py migrate
```

```text
Objeto: registro.categoria_autoria
UUID no ORM/SQL: categoria_autoria_id
Campo de entrada/saída da API existente: categoria_autoria
Texto de saída: categoria_nome
```

Nos outros guias, `Genero` é a tabela de exemplo do seu ensaio. Se o enunciado pedir departamentos/tipos/setores, use os nomes e os três valores pedidos; ajuste o destino da FK, o queryset e o `source` do texto juntos.
