# Ambiente de desenvolvimento em containers

Para os comandos de início e parada da instalação atual no Mac, veja
[QUICK_START.md](QUICK_START.md).

A branch escolhe o banco: `develop`, `acceptance` e features usam PostgreSQL
local; `main` usa Supabase. O comando de início é o mesmo:

```bash
python3 Devops/dev.py up
python3 Devops/dev.py check-db
```

Requer Docker Compose 2.24.4+ e Python 3.10+ no host. O frontend local abre em
http://localhost:5173 e a API em http://localhost:8000. Se houver portas ocupadas,
use `--port-offset 2` em todos os comandos (frontend 5175, API 8002).

Pare o app com `python3 Devops/dev.py down` antes de trocar de branch.
Na `main`, mantenha `.env.supabase` configurado. Consulte o
[guia de desenvolvimento](DEVELOPMENT.md) para os padrões por branch,
manter os dois apps simultaneamente, configurar integrações e executar testes.
O [guia Supabase](SUPABASE.md) cobre conexão e schema privado; o
[guia CI/CD](CI_CD.md) descreve os pipelines e a preparação para AWS ou Azure.

O modo local aplica migrations automaticamente. O modo Supabase exige comandos
explícitos para migrations e seed. Ambos mantêm hot reload. Para editar somente
um dos apps, execute-os em checkouts/worktrees diferentes.

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

## Dados, arquivos e testes

Depois do seed, use `joao.silva@example.test` (locador),
`maria.oliveira@example.test` (locatário) ou `admin@example.test` (administrador),
todos com senha inicial `Teste1234`. São contas fictícias para desenvolvimento. O seed é
reexecutável e preserva registros existentes; confira antes com `seed-preview`.
Consulte [o inventário](SEED.md). Para testar upload, configure o Firebase no
arquivo do ambiente selecionado.
O arquivo `BackEnd/firebase-service-account.json` fica fora da imagem e do Git;
no desenvolvimento ele é acessível pelo bind mount do backend.

```bash
python3 Devops/dev.py up --mode local
python3 Devops/dev.py test --mode local
python3 Devops/dev.py down --mode local
```

O comando `down` preserva os volumes. Consulte a instalação do Playwright e os
comandos de testes do frontend em [DEVELOPMENT.md](DEVELOPMENT.md#comandos-e-testes).

## Precificação com Groq gratuito

A pesquisa foi migrada de Compound para o `browser_search` do GPT-OSS 20B,
com a mesma chave Groq. Os modelos Compound têm encerramento em 21/09/2026 e
não são mais usados pelo adaptador. Consulte o
[aviso da Groq](https://console.groq.com/docs/deprecations) e a
[documentação de Browser Search](https://console.groq.com/docs/tool-use/built-in-tools/browser-search).

1. Crie uma chave em [Groq Console](https://console.groq.com/keys) e mantenha
   a conta no plano **Free**. Contas no plano Developer são cobradas por uso.
2. Preencha `.env.local` ou `.env.supabase`, conforme o modo selecionado
   (não coloque a chave no frontend):

   ```dotenv
   PRICING_AI_PROVIDER=groq
   GROQ_API_KEY=sua_chave
   ```

3. Reaplique o ambiente da branch atual para carregar as novas variáveis
   (preserve seu `--port-offset`):

   ```bash
   python3 Devops/dev.py up
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
