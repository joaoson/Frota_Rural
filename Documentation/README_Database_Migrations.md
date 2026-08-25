# Guia de Migrações de Banco de Dados: Adicionando Colunas

Este guia explica o processo passo-a-passo para adicionar uma nova coluna a qualquer tabela no backend Django.

> **Atualizado após a modularização.** O app único `api` foi dividido em apps por domínio. Cada model
> agora vive no app do seu domínio — consulte a tabela da seção "Onde fica cada model" antes de
> procurar um arquivo. O app `api` ainda existe, mas apenas com os models legados que faltam extrair.
>
> Para **onde colocar código novo** (regra de negócio, validação, chamadas externas), veja
> [`architecture/`](architecture/README.md). Este guia trata somente de alterações de schema.

## Passos para Adicionar uma Coluna

1. **Localize o Arquivo de Models:**
   Abra o `models.py` do app correspondente — por exemplo `BackEnd/machines/models.py` para
   `Machines`, ou `BackEnd/document_validation/models.py` para `OperatorLicense`. A tabela abaixo
   mapeia cada model ao seu app.

2. **Adicione o Campo à Classe do Modelo:**
   Encontre a classe do modelo correspondente à tabela que você deseja modificar e adicione a
   definição do novo campo utilizando os tipos de campos de modelo do Django.
   *Importante*: Se a tabela já contiver dados, você deve fornecer um valor `default` (padrão) ou
   permitir que o campo seja nulo adicionando `null=True, blank=True`.

   ```python
   # Exemplo: Adicionando um campo de texto (string)
   novo_nome_da_coluna = models.CharField(max_length=100, null=True, blank=True)
   ```

   *Para campos de estado (status, tipo, categoria), use `models.TextChoices` em vez de texto livre —
   ver [`architecture/07-conventions.md`](architecture/07-conventions.md).*

3. **Gere o Arquivo de Migração:**
   Abra seu terminal, navegue até a pasta do backend (`Frota_Rural/BackEnd`) e execute:
   ```bash
   python manage.py makemigrations
   ```
   *Nota: Isso criará um novo arquivo Python na pasta `migrations/` **do app que você alterou** — por
   exemplo `document_validation/migrations/`.*

4. **Aplique a Migração:**
   Aplique a migração gerada para atualizar o esquema real do banco de dados PostgreSQL:
   ```bash
   python manage.py migrate
   ```

5. **Atualize Serializer e Views:**
   Se a nova coluna deve ser acessível pela API, atualize o `serializer.py` **do mesmo app** e, se
   necessário, o `views.py` dele. Cada app tem os seus.

---

## Onde fica cada model

| Model | App | Arquivo |
|---|---|---|
| `Users` | `users` | `BackEnd/users/models.py` |
| `PasswordResets` | `authentication` | `BackEnd/authentication/models.py` |
| `Machines` | `machines` | `BackEnd/machines/models.py` |
| `Postings`, `PostingsPhotos` | `postings` | `BackEnd/postings/models.py` |
| `PostingModeration` | `administration` | `BackEnd/administration/models.py` |
| `OperatorLicense`, `Certification` | `document_validation` | `BackEnd/document_validation/models.py` |
| `Contracts`, `Rentals`, `Messages`, `Reviews` | `api` *(legado)* | `BackEnd/api/models.py` |

O model `Credentials`, citado em versões anteriores deste guia, **não existe mais** — foi substituído
por `OperatorLicense` e `Certification` em `document_validation`.

Os quatro models restantes em `api` ainda serão extraídos para apps próprios (ver o TODO em
`BackEnd/api/models.py:17-18`). Eles foram gerados por `inspectdb` e, por isso, usam
`models.DO_NOTHING` nas FKs e `id = UUIDField(primary_key=True)` **sem default** — ao mexer neles,
lembre-se de que o UUID e os timestamps precisam ser preenchidos manualmente.

---

## Exemplos (Mocks) de Migrações para Cada Tabela

Exemplos de como adicionar uma coluna fictícia (`coluna_mock`) a cada tabela existente.

### 1. Contracts — `api/models.py`
```python
class Contracts(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=50, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 2. OperatorLicense — `document_validation/models.py`
```python
class OperatorLicense(models.Model):
    # ... campos existentes ...
    coluna_mock = models.IntegerField(default=0, help_text='Coluna mock adicionada para demonstração')
```

### 3. Certification — `document_validation/models.py`
```python
class Certification(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=100, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 4. Machines — `machines/models.py`
```python
class Machines(models.Model):
    # ... campos existentes ...
    coluna_mock = models.BooleanField(default=False, help_text='Coluna mock adicionada para demonstração')
```

### 5. Messages — `api/models.py`
```python
class Messages(models.Model):
    # ... campos existentes ...
    coluna_mock = models.TextField(blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 6. Postings — `postings/models.py`
```python
class Postings(models.Model):
    # ... campos existentes ...
    coluna_mock = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text='Coluna mock adicionada para demonstração')
```

### 7. PostingsPhotos — `postings/models.py`
```python
class PostingsPhotos(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=255, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 8. Rentals — `api/models.py`
```python
class Rentals(models.Model):
    # ... campos existentes ...
    coluna_mock = models.DateField(blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 9. Reviews — `api/models.py`
```python
class Reviews(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=100, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 10. Users — `users/models.py`
```python
class Users(AbstractBaseUser):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=50, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 11. PasswordResets — `authentication/models.py`
```python
class PasswordResets(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=20, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 12. PostingModeration — `administration/models.py`
```python
class PostingModeration(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=50, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```
