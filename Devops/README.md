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

O backend executa `migrate` antes de iniciar. Para carregar dados de desenvolvimento em um banco novo (execute uma vez):

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

## Chat em tempo real

O `compose.yaml` sobe um serviço `redis` (imagem `redis:7.4-alpine`) usado
apenas como *channel layer* do Django Channels — barramento efêmero entre
processos ASGI. O Postgres continua sendo a única fonte de verdade das
mensagens; nada de chat é persistido no Redis, por isso o serviço não tem
volume.

WebSocket é servido na mesma porta do HTTP: `ws://localhost:8000/ws/chat`.

### Sem Docker?

Dá para rodar tudo localmente sem Redis. Em `BackEnd/.env`:

    CHANNEL_LAYER_BACKEND=memory

O `runserver` atende tudo num processo só, então o `InMemoryChannelLayer`
alcança as duas abas do browser e a feature inteira funciona ponta a ponta.
Fora do `DJANGO_DEBUG=true` esse valor é recusado (`ImproperlyConfigured`):
com mais de um worker o fan-out entre processos não aconteceria.

## Testar ao lado de uma instalação local

Se as portas padrão já estiverem ocupadas, ajuste o `.env` da raiz antes de
executar `docker compose up --build -d`:

```dotenv
FRONTEND_PORT=5174
BACKEND_PORT=8001
POSTGRES_PORT=5433
REDIS_PORT=6380
FRONTEND_URL=http://localhost:5174
VITE_API_BASE_URL=http://localhost:8001/api/
VITE_WS_BASE_URL=ws://localhost:8001
```

Os endereços `VITE_*` são acessados pelo navegador, por isso usam a porta
publicada no host. O backend continua acessando `db:5432` e `redis:6379` na
rede interna do Compose. A configuração atual de CORS permite o frontend na
porta 5174.

Depois do seed, use `joao.silva@email.com` (locador) ou
`maria.oliveira@email.com` (locatário), ambos com senha `Teste1234`.
São contas de demonstração para desenvolvimento. As URLs de fotos e documentos
do seed são exemplos; para testar upload, configure o Firebase local.
O arquivo `BackEnd/firebase-service-account.json` fica fora da imagem e do Git;
no desenvolvimento ele é acessível pelo bind mount do backend.

Validação dentro dos containers:

```bash
docker compose exec backend python manage.py test --noinput
docker compose exec frontend npm run build
docker compose exec frontend npm test
```

## Precificação com Groq gratuito

1. Crie uma chave em [Groq Console](https://console.groq.com/keys) e mantenha
   a conta no plano **Free**. Contas no plano Developer são cobradas por uso.
2. Preencha o `.env` da raiz (não coloque a chave no frontend):

   ```dotenv
   PRICING_AI_PROVIDER=groq
   GROQ_API_KEY=sua_chave
   ```

3. Recrie apenas o backend para carregar as variáveis do `.env`:

   ```bash
   docker compose up -d --no-deps --force-recreate backend
   ```

4. Entre como locador, abra **Novo Anúncio**, selecione um equipamento e clique
   em **Sugerir valor com base no mercado**.

Cada pesquisa sem cache usa duas chamadas: `groq/compound` pesquisa na web e
`openai/gpt-oss-120b` extrai o JSON. Ambos constam no
[plano gratuito](https://console.groq.com/docs/rate-limits); as cotas efetivas
variam por conta e podem mudar. O adaptador não faz retries automáticos nem
fallback para outro provedor. Respostas incompletas, sem fontes, cota esgotada
ou chave ausente deixam o preço manual disponível. A precificação continua
sendo calculada pelo motor determinístico do backend.

### Outros provedores

- Gemini: `PRICING_AI_PROVIDER=gemini`, `GEMINI_API_KEY` e
  `GEMINI_MODEL=gemini-2.5-flash`. Em uma verificação real de setembro de 2026,
  a API recusou esse modelo para novos usuários com HTTP 404. Não o use como
  opção padrão para contas novas. Modelos mais recentes têm condições
  diferentes para busca; confira os [preços do Google](https://ai.google.dev/gemini-api/docs/pricing)
  antes de alterar o modelo. As sugestões de pesquisa do Google são exibidas
  em iframe isolado, sem permissão para scripts ou acesso à origem do app.
- Claude: `PRICING_AI_PROVIDER=anthropic` e `ANTHROPIC_API_KEY` (pago).
