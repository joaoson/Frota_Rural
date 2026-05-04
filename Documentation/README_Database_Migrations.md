# Guia de Migrações de Banco de Dados: Adicionando Colunas

Este guia explica o processo passo-a-passo para adicionar uma nova coluna a qualquer tabela no backend Django. Ele também inclui exemplos de simulação (mock) para cada uma das tabelas atualmente definidas no sistema.

## Passos para Adicionar uma Coluna

Para adicionar uma nova coluna ao seu banco de dados com segurança, você deve usar o Object-Relational Mapping (ORM) integrado do Django e o seu sistema de migrações.

1. **Localize o Arquivo de Models:**
   Abra o arquivo que contém os modelos do banco de dados: `Frota_Rural/BackEnd/api/models.py`.

2. **Adicione o Campo à Classe do Modelo:**
   Encontre a classe do modelo correspondente à tabela que você deseja modificar (por exemplo, `Machines`, `Users`). Adicione a definição do novo campo utilizando os tipos de campos de modelo do Django.
   *Importante*: Se a tabela já contiver dados, você deve fornecer um valor `default` (padrão) ou permitir que o campo seja nulo adicionando `null=True, blank=True`.
   
   ```python
   # Exemplo: Adicionando um campo de texto (string)
   novo_nome_da_coluna = models.CharField(max_length=100, null=True, blank=True)
   ```

3. **Gere o Arquivo de Migração:**
   Abra seu terminal, navegue até a pasta do backend (`Frota_Rural/BackEnd`) e execute o seguinte comando para gerar o arquivo de migração baseado nas alterações feitas:
   ```bash
   python manage.py makemigrations
   ```
   *Nota: Isso criará um novo arquivo Python na pasta `api/migrations/`.*

4. **Aplique a Migração:**
   Aplique a migração gerada para atualizar o esquema real do banco de dados PostgreSQL:
   ```bash
   python manage.py migrate
   ```

5. **Atualize Serializers e Views (Opcional, mas provavelmente necessário):**
   Se você quiser que esta nova coluna seja acessível através da API, lembre-se de atualizar o serializer correspondente em `api/serializer.py` e, potencialmente, qualquer lógica de negócio em `api/views.py`.

---

## Exemplos (Mocks) de Migrações para Cada Tabela

Abaixo estão exemplos mostrando como adicionar uma coluna fictícia (`coluna_mock`) a cada tabela existente em `api/models.py`.

### 1. Contracts
```python
class Contracts(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=50, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 2. Credentials
```python
class Credentials(models.Model):
    # ... campos existentes ...
    coluna_mock = models.IntegerField(default=0, help_text='Coluna mock adicionada para demonstração')
```

### 3. Machines
```python
class Machines(models.Model):
    # ... campos existentes ...
    coluna_mock = models.BooleanField(default=False, help_text='Coluna mock adicionada para demonstração')
```

### 4. Messages
```python
class Messages(models.Model):
    # ... campos existentes ...
    coluna_mock = models.TextField(blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 5. Postings
```python
class Postings(models.Model):
    # ... campos existentes ...
    coluna_mock = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text='Coluna mock adicionada para demonstração')
```

### 6. PostingsPhotos
```python
class PostingsPhotos(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=255, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 7. Rentals
```python
class Rentals(models.Model):
    # ... campos existentes ...
    coluna_mock = models.DateField(blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 8. Reviews
```python
class Reviews(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=100, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 9. Users
```python
class Users(AbstractBaseUser):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=50, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```

### 10. PasswordResets
```python
class PasswordResets(models.Model):
    # ... campos existentes ...
    coluna_mock = models.CharField(max_length=20, blank=True, null=True, help_text='Coluna mock adicionada para demonstração')
```
