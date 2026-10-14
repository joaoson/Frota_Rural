# Banco selecionado pela branch

O mesmo frontend React e backend Django podem usar PostgreSQL em Docker ou o
projeto Supabase. O navegador sempre acessa Django; login, arquivos e integrações
continuam na aplicação. O comando de início escolhe o banco pela branch atual:

| Branch | Banco padrão |
| --- | --- |
| `develop` | PostgreSQL local no Docker |
| `acceptance` | PostgreSQL local no Docker |
| `main` | Supabase, usando `.env.supabase` |
| Branches de feature e demais branches | PostgreSQL local no Docker |

O código de configuração é o mesmo nas três branches; não é necessário manter
arquivos Compose diferentes em cada branch. Essa regra passa a valer em uma
branch quando ela receber esta implementação. O script não cria branches e não
copia nem sincroniza dados entre bancos.

## Início rápido

Requisitos: Docker Desktop em execução, Compose **2.24.4+**, Git e Python **3.10+** no host.
Execute os comandos na raiz deste checkout. Node e Python da aplicação ficam nas
imagens; o Python do host executa somente o script de configuração.

```bash
python3 Devops/dev.py config
python3 Devops/dev.py up
python3 Devops/dev.py check-db
```

Use os mesmos comandos em qualquer branch: não precisa escrever `local` ou
`supabase`. A primeira linha mostra a branch e o banco selecionado. Na `main`,
`.env.supabase` é obrigatório: se estiver ausente, o comando falha, sem trocar
para um banco local. Veja [como configurar a conexão](SUPABASE.md).

O modo local funciona com `.env.local.example` sem criar um arquivo privado. Para
personalizar integrações, copie esse exemplo para `.env.local` **somente se o
arquivo ainda não existir**. O arquivo privado é ignorado pelo Git.

| Modo | Arquivo selecionado | Frontend | API | PostgreSQL no host | Redis no host |
| --- | --- | --- | --- | --- | --- |
| `local` | `.env.local`, ou `.env.local.example` | 5173 | 8000 | 5432 | 6379 |
| `supabase` | `.env.supabase` | 5174 | 8001 | Banco remoto | 6380 |

As portas de desenvolvimento são publicadas somente em `127.0.0.1`. Use
`http://localhost:PORTA` no navegador. Cada modo tem seu próprio projeto Compose,
rede, volumes de dados/arquivos e nomes de cookies. É possível manter ambos
abertos sem que o login de um substitua o cookie do outro.

Para adicionar dados fictícios ao ambiente local iniciado, execute
`python3 Devops/dev.py seed-preview --mode local` e depois
`python3 Devops/dev.py seed --mode local` (preservando seu offset).
O seed cria contas fictícias: `joao.silva@example.test` (locador) e
`maria.oliveira@example.test` (locatário), senha inicial `Teste1234`. Preserva os
registros existentes. Veja o [inventário](SEED.md).

## Portas ocupadas e várias cópias do código

`--port-offset` soma o mesmo número às portas base. Por exemplo, este comando
inicia frontend 5175, API 8002, PostgreSQL 5434 e Redis 6381:

```bash
python3 Devops/dev.py up --port-offset 2
python3 Devops/dev.py check-db --port-offset 2
python3 Devops/dev.py status --port-offset 2
python3 Devops/dev.py down --port-offset 2
```

Use as mesmas opções em todos os comandos desse ambiente, incluindo qualquer
`--mode` explícito ao parar o app. Também existem
`--env-file CAMINHO` e `--project NOME`. O nome padrão inclui modo e um hash do
caminho do checkout; clones/worktrees diferentes recebem volumes diferentes,
mas ainda precisam de portas distintas para executar ao mesmo tempo. Nomes
customizados de projeto devem ser exclusivos por ambiente.

Os novos nomes de projeto não adotam containers de uma instalação antiga feita
com `docker compose up`. Mantenha a instalação antiga em suas portas e escolha
outro offset, ou pare-a com seu comando Compose original, preservando os volumes.
O comando `down` deste script mantém os volumes para a próxima inicialização.

## Trocar de branch

**Pare o app antes de trocar de branch**, pois hot reload muda o código montado,
mas um container já iniciado mantém sua conexão de banco. Depois de salvar seu
trabalho e quando a branch de destino contiver este helper:

```bash
python3 Devops/dev.py down
git switch develop
python3 Devops/dev.py up
```

Troque `develop` por `acceptance` ou `main` conforme a branch existente que
pretende usar. Preserve seu `--port-offset` nos comandos de parada/início. A
`main` exige a conexão Supabase configurada nesse checkout.

Se já trocou de branch sem parar, desligue explicitamente o modo anterior:
`python3 Devops/dev.py down --mode local` ou
`python3 Devops/dev.py down --mode supabase`, com as mesmas opções usadas no
início. `develop` e `acceptance` compartilham o banco local quando alternadas no
mesmo checkout; worktrees distintos têm volumes locais distintos.

## Editar localmente sem alterar o app conectado ao Supabase

Os dois modos mantêm hot reload de `FrontEnd/` e `BackEnd/`. Se executados no mesmo
checkout, **ambos carregam as mesmas edições**. Para experimentar somente no app
local, use dois checkouts ou worktrees Git:

- Checkout estável: branch `main`, conectada ao Supabase.
- Checkout de trabalho: branch `develop`, `acceptance` ou feature, com banco local e portas livres.

Faça commits e integre a branch quando os testes passarem. Não é necessário
duplicar a arquitetura da aplicação ou manter implementações diferentes para
cada banco. Alterações nas dependências Python exigem executar `up` novamente,
que reconstrói as imagens. As dependências Node ficam em um volume persistente;
depois de alterar `FrontEnd/package.json` ou seu lockfile em um ambiente já
inicializado, atualize esse volume antes de reiniciar o app:

```bash
python3 Devops/dev.py install-frontend
python3 Devops/dev.py up
```

Use o offset do ambiente escolhido. `install-frontend` executa `npm ci`
em um container temporário do frontend, sem iniciar ou acessar o banco.

## Configuração e integrações

O script carrega **apenas o arquivo selecionado**. `.env` da raiz, `BackEnd/.env`
e variáveis de aplicação herdadas do shell não fornecem credenciais a esses
ambientes. As variáveis do runtime Docker, como `DOCKER_CONTEXT`, são preservadas.
As URLs do frontend/API/WebSocket são calculadas a partir do offset.

No modo local, `DATABASE_URL` e o schema remoto são explicitamente removidos e
o backend usa `db:5432`, mesmo se uma URL hospedada tiver sido copiada por engano
para `.env.local`. No modo Supabase, a URL vem do arquivo selecionado.

Para usar Groq, Stripe em teste, Resend ou Firebase, coloque suas configurações no
arquivo do modo desejado. Chaves existentes em `.env` ou `BackEnd/.env` **não são
copiadas automaticamente**. Usar bancos diferentes não isola serviços externos:
escolha credenciais de teste ou recursos separados para os experimentos. Sem
essas chaves, os testes automatizados continuam funcionando, mas recursos que
dependem dos provedores precisam ser configurados para uso manual.

`up` nas branches locais aplica migrations por padrão (`RUN_MIGRATIONS=auto`). O modo
Supabase sempre desativa migrations no startup. Estes modos são de
desenvolvimento, com `DEBUG=true`; não são uma configuração de produção.

## Usar o Supabase

Prepare `.env.supabase` e o schema privado conforme o [guia Supabase](SUPABASE.md).
Se o arquivo já existe, preserve a conexão e acrescente somente as integrações
que deseja habilitar neste ambiente. Na branch `main`, os comandos normais abaixo
já selecionam Supabase:

```bash
python3 Devops/dev.py config
python3 Devops/dev.py up
python3 Devops/dev.py check-db
python3 Devops/dev.py plan-migrations
```

`config` valida os arquivos sem iniciar serviços ou conectar ao banco. `up`
constrói as imagens e inicia Redis, Django e Vite, sem PostgreSQL local e sem
migrations automáticas. `check-db` mostra o destino sem senha. Um banco novo
precisa das migrations antes de atender os fluxos da aplicação.

Somente quando quiser aplicar alterações ao projeto remoto revisado:

```bash
python3 Devops/dev.py migrate --mode supabase --allow-remote
python3 Devops/dev.py seed-preview --mode supabase
python3 Devops/dev.py seed --mode supabase --allow-remote
```

Os comandos de banco usam containers temporários com a configuração selecionada,
mesmo se um backend antigo estiver rodando com outras variáveis. Testes Django e
Playwright são recusados no modo Supabase. O app em uso continua escrevendo no
banco escolhido normalmente; a flag limita os comandos de manutenção, não as
ações dos usuários.

## Comandos e testes

```bash
python3 Devops/dev.py status
python3 Devops/dev.py logs
python3 Devops/dev.py down
```

Para testes locais, inclusive na `main`, preserve o modo explícito em toda a
sequência (e escolha portas livres com `--port-offset` se necessário):

```bash
python3 Devops/dev.py up --mode local
python3 Devops/dev.py test --mode local
python3 Devops/dev.py down --mode local
python3 -m unittest discover -s Devops/tests -v
```

`check-db`, migrations, seed e testes precisam da imagem construída; no modo
local, banco e Redis devem estar iniciados com `up`. `logs` acompanha os serviços
até Ctrl+C. Não use `down -v` se deseja preservar o banco e uploads locais.

Para testes de navegador, instale Node 22.12+ e as dependências no host uma vez:

```bash
cd FrontEnd
npm ci
npx playwright install
cd ..
python3 Devops/dev.py e2e --mode local
```

O script seleciona automaticamente o container correto para as fixtures e as
URLs do ambiente. Para offset 2, acrescente `--port-offset 2` ao comando `e2e`.
Veja [cobertura e relatórios](../FrontEnd/tests/README.md) e
[CI/CD](CI_CD.md).

## Modo explícito e CI

Para situações específicas, `--mode local` ou `--mode supabase` substitui a
seleção da branch. Os comandos anteriores (`local up`, `supabase up`, etc.)
continuam aceitos como modos explícitos. A CI sempre usa banco local descartável,
inclusive ao testar `main`; testes nunca são executados no Supabase.

Em um checkout sem branch (detached HEAD) ou fora do Git, o modo automático falha
com uma instrução para escolher `--mode`. Essa escolha explícita também permite
usar um arquivo ZIP do código. A variável de ambiente do CI não decide o banco:
a seleção automática consulta a branch real do checkout.

## Compose direto e execução nativa

A seleção por branch pertence a `Devops/dev.py`. `docker compose up` direto
não consulta Git: o `compose.yaml` base força o banco local, e Supabase exige
`compose.supabase.yaml`. Para isolamento
de credenciais, cookies e projetos, prefira este script e seu override
`compose.development.yaml`.

Fora desse script, Django preserva a ordem de configuração existente: processo,
`BackEnd/.env`, `.env` da raiz. `DJANGO_LOAD_ENV_FILES=false` desliga a leitura
automática desses arquivos. O script define essa opção explicitamente.

A implementação usa as regras oficiais de
[precedência de variáveis](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)
e [combinação de arquivos Compose](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/).
