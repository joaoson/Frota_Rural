# Frota Rural - BackEnd

Um backend baseado em Django para o projeto Frota Rural.

## Pré-requisitos

Antes de executar este projeto, certifique-se de ter o seguinte instalado:

- **Python 3.14**: O projeto é desenvolvido e testado com Python 3.14.
- **PostgreSQL 17**: O banco de dados usado é PostgreSQL versão 17.
- **Ambiente Virtual**: Módulo `venv` do Python para gerenciamento de ambiente isolado.

## Instruções de Configuração

1. **Clone o repositório** (se ainda não foi feito):

   ```bash
   git clone <repository-url>
   cd Frota_Rural/BackEnd
   ```

2. **Crie e ative um ambiente virtual**:

   ```bash
   python -m venv venv
   source venv/bin/activate  # No Windows: venv\Scripts\activate
   ```

3. **Instale as dependências**:

   ```bash
   pip install -r environment/requirements.txt
   ```

4. **Configure o banco de dados PostgreSQL**:
   - Certifique-se de que o PostgreSQL 17 esteja em execução no seu sistema.
   - Crie um banco de dados chamado `frota_rural` (ou conforme especificado no seu arquivo `.env`).
   - Crie um usuário com permissões apropriadas (ex.: `postgres`).

5. **Crie a configuração do ambiente**:
   - Copie ou crie um arquivo `.env` na pasta `environment/` com suas credenciais do banco de dados:
     ```
     DB_NAME=frota_rural
     DB_USER=postgres
     DB_PASSWORD=sua_senha
     DB_HOST=localhost
     DB_PORT=5432
     ```
   - Ajuste os valores de acordo com sua configuração do PostgreSQL.

## Executando o Projeto

1. **Ative o ambiente virtual** (se ainda não estiver ativado):

   ```bash
   cd BackEnd
   source venv/bin/activate
   ```

2. **Execute as migrações do banco de dados** (se necessário):

   ```bash
   python manage.py migrate
   ```

3. **Inicie o servidor de desenvolvimento do Django**:

   ```bash
   python manage.py runserver
   ```

4. **Acesse a aplicação**:
   - Abra seu navegador e vá para `http://127.0.0.1:8000/`

## Notas Adicionais

- Vídeo de base para REST API em Django: https://www.youtube.com/watch?v=NoLF7Dlu5mc
- Se você encontrar problemas de conexão com o banco de dados, verifique as configurações do seu arquivo `.env` e certifique-se de que o PostgreSQL esteja em execução.
- Para implantação em produção, considere usar variáveis de ambiente ou um sistema de gerenciamento de segredos em vez do arquivo `.env`.
- Certifique-se de manter seu ambiente virtual ativado sempre que trabalhar com o projeto.

## Endereço base da API

O endereço base da API é:

```
http://127.0.0.1:8000/api/
```

Você pode ver todas as rotas no arquivo mysite/urls.py.

As requisições podem ser feitas via Postman (ou qualquer cliente HTTP). Exemplo de requisição POST para criar um usuário (rota: users/create):

Request body (JSON):

```json
{
  "name": "João Silva2",
  "document": "123.456.789-02",
  "email": "joao.silva@example.com",
  "password_hash": "pbkdf2_sha256$720000$randomsalt$hashedpassword",
  "phone": "+5511999999999",
  "role": "locador",
  "status": "active"
}
```
