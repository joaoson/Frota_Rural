# ADR 0001: Ambiente de desenvolvimento containerizado

**Status:** Aceito
**Data:** 2026-08-31

## Contexto

O projeto mistura Django, React/Vite, PostgreSQL e um classificador de documentos
baseado em TensorFlow. A execução no host depende de Python 3.14 para o backend e
Python 3.13 para o classificador, além de bibliotecas de sistema como Poppler. Isso
permitiu que dependências declaradas, como `drf-spectacular`, não estivessem presentes
no ambiente ativo e causassem falhas apenas na inicialização.

## Decisão

Usar Docker Compose como ponto de entrada do desenvolvimento local, com os serviços:

- `db`: PostgreSQL 17 em volume nomeado e healthcheck;
- `backend`: Django em Python 3.13, com as dependências web e um `venv` de ML isolado
  em `/opt/ml-venv`;
- `frontend`: Vite em Node 22, com `node_modules` em volume nomeado.

O backend espera o banco estar saudável e roda migrations idempotentes antes do
servidor. A configuração de desenvolvimento é fornecida por `.env`, criado a partir
de `.env.example`; credenciais reais não são incluídas na imagem.

O classificador passa a aceitar `ML_PYTHON`, mantendo o caminho atual como padrão
para quem ainda executa sem containers.

## Consequências

- O comando suportado para iniciar o ambiente passa a ser `docker compose up --build`.
- O host deixa de precisar de Python, Node, PostgreSQL, Poppler ou TensorFlow para
  executar a aplicação.
- A primeira build é maior por incluir TensorFlow; as seguintes reutilizam camadas.
- O Compose é voltado a desenvolvimento. Produção deve usar imagens imutáveis,
  servidor WSGI/ASGI e gestão de segredos próprios.


## Atualização: modos isolados de desenvolvimento (2026-10-14)

O comando recomendado passa a ser `python3 Devops/dev.py up`. A branch `main`
seleciona Supabase; `develop`, `acceptance` e branches de feature selecionam o
banco local. Modos explícitos continuam disponíveis para CI e manutenção. O helper requer Python 3.10+ no host apenas para
orquestrar Compose; as dependências Python/Node da aplicação permanecem nos
containers. Compose direto continua disponível.

Cada modo seleciona um arquivo de ambiente próprio, projeto Compose, portas e
cookies separados. O modo local força o banco Docker; Supabase desativa migrations
automáticas e exige comandos explícitos para migrations e seed. As edições do
código ainda seguem o checkout montado, portanto dois apps precisam de worktrees
diferentes para isolar mudanças de código. Detalhes e atualização do volume de
dependências Node estão em [Devops/DEVELOPMENT.md](../../Devops/DEVELOPMENT.md).

A detecção da branch acontece no comando de startup, sem depender de Git dentro
da imagem. É necessário parar o app antes de trocar a branch do checkout montado
e iniciar novamente para aplicar a conexão correspondente. A CI usa sempre
banco local descartável, mesmo ao validar `main`. Sem uma branch identificável,
o modo automático falha e requer seleção explícita. A escolha do banco não
transforma o Compose de desenvolvimento em uma configuração de produção.
