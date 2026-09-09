# Integração de precificação e chat com develop

Branch: `codex/retrofit-pricing-chat-develop`.

## Origem

- Base: `origin/develop` em `c44750f` (nova arquitetura do frontend).
- Precificação: commits `97907c0`, `a3dbec7` e `7465a3c` da branch
  `feature/sugestao-preco-hora-ia`.
- Chat: `origin/codex/containerize-development` em `4e779ed` já é ancestral
  de `develop`. A integração mantém sua implementação migrada em `features/chat`.
- A cópia das alterações locais do mascote foi adaptada para `features/home` e
  `pages/public/Index.tsx`. O checkout original e seus arquivos locais foram preservados.

## Adaptação

A precificação segue página → hook → store → repository → HTTP injetado pelo
`app/container.ts`. A resposta é validada com Zod. Pedir uma sugestão é uma
mutação explícita, sem retry automático de pesquisa paga. Uma troca de máquina
descarta o pedido anterior; respostas atrasadas não podem fornecer preço ou
`suggestion_id` de outra seleção. Fechar o painel mantém o vínculo de auditoria
com o preço visto, mesmo se o locador escolher outro valor.

Potência e horímetro passam pelos schemas, mapper e formulários de máquinas.
Zero horas permanece diferente de leitura ausente; limpar os campos na edição
envia `null`. A edição usa um hook que invalida a listagem e preserva as
especificações técnicas existentes.

O adaptador HTTP preserva status e mensagem de respostas 422. O chat reconecta
com o token atual do `tokenStore`, inclusive após refresh pelo `SessionService`,
e não abre conexão ao voltar à aba depois de logout. Todos os stores registrados
participam de `clearAllStores`. Também foi removido o export não utilizado de
`buttonVariants`, que impedia o lint de `develop` de passar.

## Validação

- `npm ci`, `npm run lint`, `npm run build` e `npm test` em `FrontEnd`.
- 15 testes frontend: contrato HTTP e resposta 422, campos numéricos, resposta
  atrasada A → B → A, retry manual, auditoria e reconexão do chat.
- 68 testes backend: `python manage.py test --noinput` em `BackEnd`, com PostgreSQL
  isolado, banco de teste UTF-8 e Channels em memória. Inclui os testes REST e
  WebSocket do chat e os testes de precificação com pesquisa externa simulada.
- `python manage.py makemigrations --check --dry-run`: sem alterações pendentes.

O build mantém o aviso de bundle grande. A pesquisa externa paga não foi chamada
na validação. Para executar a integração real, configure o backend conforme
`.env.example`, incluindo `ANTHROPIC_API_KEY` para pesquisa, e aplique
`python manage.py migrate`. O valor manual continua disponível quando não há
sugestão confiável. O ambiente de validação não migrou o banco de desenvolvimento.
