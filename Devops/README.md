# Ambiente de desenvolvimento em containers

O ambiente completo é iniciado a partir da raiz do repositório:

```bash
cp .env.example .env
docker compose up --build
```

Serviços disponíveis:

| Serviço | URL / acesso |
| --- | --- |
| Frontend (Vite) | http://localhost:5173 |
| Backend (Django) | http://localhost:8000 |
| Swagger UI | http://localhost:8000/api/schema/swagger-ui/ |
| PostgreSQL | `localhost:5432` |

O backend executa `migrate` antes de iniciar. Para carregar dados de desenvolvimento:

```bash
docker compose exec backend python seed.py
```

Comandos úteis:

```bash
docker compose logs -f backend
docker compose exec backend python manage.py test
docker compose down
docker compose down -v # também remove o banco local em container
```

As alterações em `BackEnd/` e `FrontEnd/` são montadas como volumes e recarregadas
automaticamente. Dependências Python e Node, o ambiente de ML e o banco permanecem
em volumes ou na imagem para que o host não interfira na execução.
