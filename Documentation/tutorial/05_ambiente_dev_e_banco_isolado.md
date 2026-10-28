# Django separado e banco para o ensaio

`Devops/dev.py` é opcional. Django pode rodar com `python manage.py runserver`; o PostgreSQL precisa estar ligado. `makemigrations`, `migrate`, `shell` e `seed.py` não precisam do servidor HTTP ligado.

Escolha **A ou B**. Ambos abaixo usam o banco do projeto Docker `frota-autoria`, com volume próprio. O nome lógico continua `frota_rural`, mas os dados são separados do ambiente atual.

| Ambiente | Frontend | API | PostgreSQL no computador |
| --- | --- | --- | --- |
| Atual | 5175 | 8002 | 5434 |
| Ensaio de autoria | 5183 | 8010 | 5442 |

Banco isolado não duplica o código: containers deste checkout carregam as mesmas edições. Durante o ensaio, use o frontend/API de autoria e deixe o ambiente antigo parado se for alterar models e migrations.

## A — Tudo pelo script

Na raiz do repositório, Docker Desktop ligado:

```bash
# Usar o exemplo explicitamente evita carregar integrações do .env.local privado.
python3 Devops/dev.py up --mode local --project frota-autoria --port-offset 10 --env-file .env.local.example
python3 Devops/dev.py check-db --mode local --project frota-autoria --port-offset 10 --env-file .env.local.example
python3 Devops/dev.py seed --mode local --project frota-autoria --port-offset 10 --env-file .env.local.example

# Manter estas variáveis no terminal em que seguir os demais tutoriais.
export AUTORIA_BACKEND=frota-autoria-backend-1
export AUTORIA_API=http://localhost:8010/api
docker exec "$AUTORIA_BACKEND" python manage.py verify_database
```

```text
Frontend: http://localhost:5183
Swagger:  http://localhost:8010/api/schema/swagger-ui
Login:    admin@example.test / Teste1234
Locador:  joao.silva@example.test / Teste1234

Nos exemplos dos demais guias, substituir o frontend :5175 por :5183.
No Docker, verify_database mostra db:5432; no host, a conexão é 127.0.0.1:5442.
```

Depois de editar um model:

```bash
docker exec "$AUTORIA_BACKEND" python manage.py makemigrations
docker exec "$AUTORIA_BACKEND" python manage.py migrate
```

Parar preservando os dados; repetir `up` para voltar:

```bash
python3 Devops/dev.py down --mode local --project frota-autoria --port-offset 10 --env-file .env.local.example
# Não acrescentar -v: o volume frota-autoria_postgres_data guarda o ensaio.
```

## B — PostgreSQL em Docker; Django e Vite no terminal

Se já iniciou a opção A, execute o `down` acima antes. Os dados serão reutilizados.

### 1 Subir somente o banco

Na raiz do repositório:

```bash
POSTGRES_DB=frota_rural POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres POSTGRES_PORT=127.0.0.1:5442 \
  docker compose --env-file .env.local.example --project-name frota-autoria -f compose.yaml up -d --wait db
```

```text
Configuração para DBeaver/pgAdmin ou Django no computador:
Host:     127.0.0.1
Porta:    5442
Database: frota_rural
Usuário:  postgres
Senha:    postgres

Credenciais apenas do banco local de ensaio.
```

### 2 Preparar Python uma vez

Python 3.13, como na imagem Docker do projeto:

```bash
cd BackEnd
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install -r docs/requirements.txt
```

### 3 Configurar a conexão em cada terminal do backend

Continuar dentro de `BackEnd`, com o venv ativo:

```bash
# Impedir que BackEnd/.env ou .env da raiz selecionem outro banco.
export DJANGO_LOAD_ENV_FILES=false
export DATABASE_URL=''
export DB_SCHEMA=''
export DB_SSLROOTCERT=''
export DB_SSLMODE=disable
export DB_HOST=127.0.0.1
export DB_PORT=5442
export DB_NAME=frota_rural
export DB_USER=postgres
export DB_PASSWORD=postgres
export DJANGO_DEBUG=true
export DJANGO_SECRET_KEY=django-insecure-autoria-local-only
export DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
export CHANNEL_LAYER_BACKEND=memory
export FRONTEND_URL=http://localhost:5183
export AUTH_REFRESH_COOKIE_NAME=frota-autoria_refresh
export SESSION_COOKIE_NAME=frota-autoria_session
export CSRF_COOKIE_NAME=frota-autoria_csrf
export CONTRACT_SIGNATURE_REQUIRE_OTP=false
export STRIPE_SECRET_KEY=''
export STRIPE_WEBHOOK_SECRET=''
export RESEND_API_KEY=''
export FIREBASE_CREDENTIALS_FILE=''
export FIREBASE_STORAGE_BUCKET=''
export AUTORIA_API=http://localhost:8010/api

python manage.py verify_database
# Confirmar: Host: 127.0.0.1:5442 / Database: frota_rural.
python manage.py migrate
python seed.py --asset-base-url http://localhost:5183/demo
python manage.py runserver 127.0.0.1:8010
```

`CHANNEL_LAYER_BACKEND=memory` permite este ensaio com um processo Django sem Redis. Os fluxos de machine learning exigem o ambiente adicional descrito em `BackEnd/ml/README.md`; ele não é necessário para tabela/FK/formulário.

### 4 Frontend em outro terminal

Na raiz do repositório:

```bash
cd FrontEnd
npm ci
VITE_API_BASE_URL=http://localhost:8010/api VITE_WS_BASE_URL=ws://localhost:8010 \
  npm run dev -- --host localhost --port 5183 --strictPort
```

### 5 Aplicar os demais tutoriais sem Docker no Django

```bash
# Em BackEnd, venv ativo e exports do passo 3 carregados.
# Trocar: docker exec "$AUTORIA_BACKEND" python manage.py ...
# Por:    python manage.py ...

python manage.py startapp autoria
# Editar os arquivos indicados no guia 00 e no modelo escolhido.
python manage.py makemigrations autoria
python manage.py makemigrations
python manage.py migrate --plan
python manage.py migrate
python manage.py shell
```

Para executar esses comandos, pode parar `runserver` com Ctrl+C e iniciá-lo novamente depois. Um terminal novo precisa ativar o venv e repetir os exports. Não é necessário recriar o venv nem executar o seed em cada início.

```bash
# Parar somente o banco; o volume e os dados permanecem.
docker stop frota-autoria-db-1
# Próxima sessão:
docker start frota-autoria-db-1
```

## Qual opção usar na defesa?

```text
A: dependências prontas nos containers; editar no VS Code e rodar manage.py por docker exec.
B: comandos Django diretamente no terminal; exige Python e dependências instaladas no computador.

makemigrations: gera arquivo de migration a partir do model.
migrate: aplica a migration ao banco da conexão atual.
runserver: inicia a API; não substitui migrate.

Trocar apenas DB_NAME em um .env não cria o banco.
Trocar apenas a porta do frontend não muda o banco da API.
No script, --project separa os volumes; --port-offset separa as portas.
```
