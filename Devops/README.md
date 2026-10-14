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
| Swagger UI | http://localhost:8000/api/schema/swagger-ui |
| PostgreSQL | `localhost:5432` |

O backend executa `migrate` antes de iniciar quando usa o banco local padrão.
Conexões externas exigem migrations explícitas. Para conectar somente o banco ao
Supabase, mantendo Docker, Redis, autenticação e Groq, siga o
[guia Supabase](SUPABASE.md).

Para carregar dados de desenvolvimento em um banco local novo (execute uma vez):

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

Depois do seed, use `joao.silva@example.test` (locador) ou
`maria.oliveira@example.test` (locatário), ambos com senha inicial `Teste1234`.
São contas fictícias para desenvolvimento, sem administrador. O seed é
reexecutável e preserva registros existentes; confira antes com `--dry-run`.
Consulte [o inventário e a execução no Supabase](SEED.md). Para testar upload,
configure o Firebase local.
O arquivo `BackEnd/firebase-service-account.json` fica fora da imagem e do Git;
no desenvolvimento ele é acessível pelo bind mount do backend.

Validação dentro dos containers:

```bash
docker compose exec backend python manage.py test --noinput
docker compose exec frontend npm run build
docker compose exec frontend npm test
```

## Precificação com Groq gratuito

A pesquisa foi migrada de Compound para o `browser_search` do GPT-OSS 20B,
com a mesma chave Groq. Os modelos Compound têm encerramento em 21/09/2026 e
não são mais usados pelo adaptador. Consulte o
[aviso da Groq](https://console.groq.com/docs/deprecations) e a
[documentação de Browser Search](https://console.groq.com/docs/tool-use/built-in-tools/browser-search).

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

Cada pesquisa sem cache usa duas chamadas: `openai/gpt-oss-20b` com
`browser_search` pesquisa e abre uma fonte; `openai/gpt-oss-120b` extrai o JSON
sem ferramentas. Browser Search não é compatível com saída estruturada na mesma
chamada. Ambos os modelos constam no
[plano gratuito](https://console.groq.com/docs/rate-limits); as cotas efetivas
variam por conta e podem mudar. A busca usa raciocínio `low`, saída de até 2.048
tokens e pede uma busca e no máximo uma página adicional. Esse limite no pedido
orienta o modelo; as cotas do provedor continuam sendo o limite efetivo.

Na verificação de 20/09/2026, uma chamada real de pesquisa da S790 2023 retornou
HTTP 200, consumindo 4.482 tokens. Os resultados da busca tinham links sem texto;
`browser.open` forneceu os trechos originais com preço, horas e localização.
O adaptador usa somente os resultados com conteúdo, preservando as mesmas
restrições de evidência. Esse teste verificou a pesquisa; não realizou pagamento,
não mudou de plano e não alterou o banco.

A extração recebe os trechos originais dos resultados, com contexto limitado a
8.000 caracteres e saída de até 2.000 tokens. Preserva condição, horas e
localização, e cita somente fontes efetivamente usadas.
Se encontrar preço do usado mas faltar o novo, o app mostra **Estimativa** com
confiança baixa e premissas explícitas de depreciação de 10% ao ano e piso de
retenção de 40%. Esse valor calculado não é salvo como cotação pesquisada; veja
[a fórmula e os limites](../Documentation/README_Sugestao_Preco_Hora.md#34-equivalente-novo-estimado-quando-o-preço-não-é-publicado).
Sem preço usado com fonte, continua disponível somente a edição manual.
O adaptador não faz retries automáticos nem
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
