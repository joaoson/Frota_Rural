# Ambiente de ensaio: banco isolado e Django nativo

Django e Vite rodam no computador. Somente o PostgreSQL usa Docker, com volume exclusivo `frota-autoria_postgres_data`.

| Serviço | Endereço / configuração |
| --- | --- |
| Frontend | http://localhost:5183 |
| API | http://localhost:8010/api |
| Swagger | http://localhost:8010/api/schema/swagger-ui |
| PostgreSQL | `127.0.0.1:5442` |
| Banco | `frota_rural_autoria` |
| Usuário / senha do banco local | `postgres` / `postgres` |
| Container do banco | `frota-autoria-db-1` |
| Branch de prática | `codex/autoria-pratica` |

## 1 Abrir o terminal para praticar

O banco, o venv e o seed já foram preparados neste checkout. Em cada terminal novo, começar na raiz do repositório:

```bash
cd BackEnd
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
```

```text
Host: 127.0.0.1:5442
Database: frota_rural_autoria
Connection OK: database=frota_rural_autoria, schema=public, TLS=disabled.
```

Mantenha esse terminal dentro de `BackEnd/` durante os comandos Django e curl dos tutoriais. Os caminhos dos arquivos a editar são relativos à raiz do repositório.

`Devops/autoria.env.sh` define a conexão isolada, `AUTORIA_API` e as URLs do Vite. Também desliga a leitura automática dos `.env` antigos. Use esse arquivo em todas as sessões de prática.

## 2 Executar o exercício

O app `autoria`, o modelo `Genero`, os três registros e a FK de `Users` já estão criados. Continuar nos guias 01, 02 e 04; não repetir `startapp`.

```bash
python manage.py showmigrations autoria users
python manage.py makemigrations --check --dry-run
python manage.py check
# Depois de alterar outro model:
python manage.py makemigrations
python manage.py migrate --plan
python manage.py migrate
```

```text
makemigrations -> gera arquivos a partir dos models.
migrate        -> aplica os arquivos ao PostgreSQL de ensaio.
runserver      -> atende a API; não precisa estar ligado para os dois comandos acima.
```

## 3 Retomar os serviços depois de desligar

### Banco

Ligar Docker Desktop e executar:

```bash
docker start frota-autoria-db-1
```

### Django

Em um terminal configurado pelo passo 1, executar apenas se a API ainda não estiver rodando:

```bash
python manage.py runserver 127.0.0.1:8010
```

Deixar esse terminal aberto. Para migrations, abrir outro terminal e repetir o passo 1. O servidor recarrega as alterações automaticamente; pare com Ctrl+C quando ele estiver em primeiro plano.

### Frontend

Em outro terminal, a partir da raiz:

```bash
cd FrontEnd
source ../Devops/autoria.env.sh
npm run dev -- --host localhost --port 5183 --strictPort
```

### Conferir os serviços

```bash
curl --fail-with-body http://localhost:8010/health/ready
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' http://localhost:5183/
```

Se a porta `8010` ou `5183` estiver ocupada e o respectivo endereço abrir, o serviço já está ativo. Os processos iniciados durante a preparação rodam em segundo plano e gravam logs em `BackEnd/.venv/autoria-django.log` e `BackEnd/.venv/autoria-vite.log`.

## 4 Contas e dados do seed

```text
Administrador: admin@example.test
Locador:       joao.silva@example.test
Locatário:     maria.oliveira@example.test
Senha inicial: Teste1234

Inventário inicial: 7 usuários, 20 máquinas, 20 anúncios, 32 locações,
37 fotos de anúncios, leituras de horímetro, contratos, avaliações e mensagens.
```

Para acrescentar registros de demonstração ausentes, no terminal do passo 1:

```bash
python seed.py --asset-base-url http://localhost:5183/demo
```

O seed preserva registros existentes. Não é necessário executá-lo em cada sessão.

## 5 Instalação inicial em outro checkout

Pular esta seção no ambiente já preparado. Em outro checkout, use projeto e portas livres se este ambiente estiver ligado.

Na raiz, criar o PostgreSQL isolado:

```bash
POSTGRES_DB=frota_rural_autoria POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres POSTGRES_PORT=127.0.0.1:5442 \
  docker compose --env-file .env.local.example --project-name frota-autoria -f compose.yaml up -d --wait db
```

`POSTGRES_DB` cria o banco somente na inicialização de um volume vazio. Neste ambiente, `frota_rural_autoria` já foi criado explicitamente; mudar a variável de um container antigo não cria outro banco.

Preparar Django com Python 3.13:

```bash
cd BackEnd
python3.13 -m venv .venv
source .venv/bin/activate
source ../Devops/autoria.env.sh
python -m pip install -r docs/requirements.txt
python manage.py verify_database
python manage.py migrate
python seed.py --asset-base-url http://localhost:5183/demo
```

Preparar o frontend em outro terminal, a partir da raiz:

```bash
cd FrontEnd
npm ci
```

Depois, iniciar os serviços pelo passo 3. Para exercícios de tabela/FK/formulário, o channel layer em memória já está configurado; os fluxos de machine learning têm dependências adicionais descritas em `BackEnd/ml/README.md`.

## 6 Preservar o banco

```bash
# Parar o banco mantendo o volume e todos os registros:
docker stop frota-autoria-db-1
# Retomar:
docker start frota-autoria-db-1
```

O volume separa os dados do ensaio dos demais ambientes. O código continua no mesmo checkout: outras instâncias desse checkout também carregam as edições. Use os endereços deste guia para praticar. Para manter os dados, não remova o volume `frota-autoria_postgres_data`.
