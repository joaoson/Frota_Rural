# Integração contínua e preparação para deploy

O repositório usa GitHub Actions para validar código, migrations, containers e
fluxos da aplicação. Ainda não há publicação de imagens nem deploy automático
para AWS ou Azure. A escolha futura de hospedagem não altera a opção de usar
PostgreSQL local no desenvolvimento ou Supabase pelo backend Django.

## Banco selecionado pela branch

Ao iniciar a aplicação com `python3 Devops/dev.py up`, o helper seleciona o modo
conforme a branch:

| Branch | Banco padrão da aplicação |
| --- | --- |
| `develop` | PostgreSQL local em Docker |
| `acceptance` | PostgreSQL local em Docker |
| `main` | Supabase, com conexão no arquivo privado `.env.supabase` |

Essa escolha vale para a execução da aplicação. **A CI sempre usa PostgreSQL
local descartável**, inclusive quando valida `main` ou um checkout de PR com
HEAD destacado. O job de configuração mantém `local config` explícito e o job
de navegador seleciona somente `compose.yaml`, sem o override Supabase. Assim,
a seleção automática por branch não envia fixtures nem migrations de teste ao
banco remoto.

Executar a aplicação a partir de `main` não publica uma nova versão na nuvem e
não transforma o Compose de desenvolvimento em configuração de produção.
O Supabase continua exigindo configuração prévia e migrations explícitas;
consulte [DEVELOPMENT.md](DEVELOPMENT.md) e [SUPABASE.md](SUPABASE.md).

## CI implementada

O workflow [Frontend tests](../.github/workflows/playwright.yml) mantém esse nome
histórico, mas verifica frontend e backend. Ele executa em pull requests para
`develop`, `acceptance` e `main`, em pushes nessas três branches e por acionamento manual.
Pushes em uma branch de feature com PR aberto geram a execução do PR; não há uma
segunda execução desse workflow pelo push da mesma branch.

| Job / nome do check | Validação |
| --- | --- |
| `config-checks` | Testes do helper de desenvolvimento com `python3 -m unittest discover -s Devops/tests -v` e validação do Compose com `python3 Devops/dev.py local config`, sem iniciar serviços. |
| `frontend-checks` | Node 22, `npm ci`, ESLint, TypeScript/build do Vite, tipagem dos testes Playwright e testes unitários Vitest. Executa independentemente dos testes de navegador. |
| `browser-tests` | Após `config-checks`, constrói as imagens Docker, inicia PostgreSQL/Redis/backend/frontend, aguarda HTTP, executa verificações Django, detecta migrations ausentes, roda a suíte Django e os fluxos Playwright em Chromium, Firefox e WebKit. |

A versão principal do Node nos dois jobs corresponde à imagem Docker do
frontend. O teste de build das imagens acontece no próprio startup da stack;
essas imagens não são enviadas a um registry.

O job de navegador usa o projeto Compose `frota-ci` em um runner isolado, com
banco local descartável e sem credenciais de Supabase ou provedores externos.
Logs, relatórios e traces do Playwright ficam em artifacts por 14 dias. A stack
e seus volumes de teste são removidos ao terminar. Não use o comando de limpeza
desse job na instalação local que contém dados que deseja preservar.

Os testes de integração verificam a aplicação real e interceptam serviços
externos nos cenários apropriados. Uma execução verde não comprova pagamento
real, entrega de email, upload no Firebase ou uma pesquisa atual do Groq. Esses
testes de provedor precisam de um ambiente separado e credenciais de teste.

### Checks recomendados para proteger `develop`, `acceptance` e `main`

Depois da primeira execução dessa versão do workflow, configure as regras da
branch no GitHub para exigir os checks `config-checks`, `frontend-checks` e
`browser-tests`, além da revisão de PR desejada pela equipe. Esses são os nomes
dos jobs atuais; não há um job chamado `deploy`. A alteração dos arquivos YAML
não configura essas regras automaticamente. Veja a documentação de
[branches protegidas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Não exija `convert_to_pdf` como check geral de todos os PRs: ele usa filtros de
arquivo. O job `mirror` também não é uma validação de PR, pois executa após pushes
em `main`.

## Outros workflows existentes

[Convert Docx to PDF](../.github/workflows/convert_doc_to_pdf.yml) executa em
pushes fora de `main` que alteram
`Documentation/bsi-especificacao-do-projeto-frota-rural.docx` ou o próprio
workflow, além do acionamento manual. A conversão agora usa esse DOCX existente,
gera o PDF em um diretório temporário novo e exige um arquivo não vazio antes de
publicar o artifact. Assim, um PDF antigo versionado na raiz não pode ser
confundido com uma conversão bem-sucedida. O workflow tem apenas permissão de
leitura do conteúdo do repositório.

[Mirror to Azure Repo](../.github/workflows/mirror_to_ado.yml) copia a branch
`main` para Azure Repos usando o secret `ADO_PAT` e o comportamento de force-push
já existente. Isso sincroniza código-fonte; não cria infraestrutura, não publica
o frontend e não inicia o backend na Azure. Esse workflow não foi convertido em
deploy.

## Caminho futuro para AWS ou Azure

### Dependências antes do deploy

Na verificação local de 14/10/2026, `npm audit` reportou 30 pacotes afetados:
1 crítico, 20 altos, 7 moderados e 2 baixos. Os manifests e o lockfile não foram
alterados por esta configuração. O item crítico vem de `proxy-addr` na árvore
da CLI `shadcn`; também há alertas em dependências diretas como Axios e React
Router. A classificação do registro não comprova que cada vulnerabilidade seja
explorável neste app; parte da árvore pertence a ferramentas de build/CLI.

A CI funcional não exige um audit limpo atualmente. A próxima etapa de segurança
é revisar os caminhos afetados, atualizar dependências com a suíte de regressão,
separar corretamente ferramentas de desenvolvimento e habilitar acompanhamento
por Dependabot/audit. Não aplicar `npm audit fix --force` indiscriminadamente:
o resultado atual inclui propostas de downgrade incompatível para `shadcn`.

### Publicação e promoção

O fluxo abaixo é uma proposta para uma próxima etapa. Nenhum recurso de nuvem,
registry, ambiente protegido, secret de deploy ou pipeline de CD é criado por
esta configuração.

1. **Preparar artefatos de produção.** O Compose atual monta o código local e
   inicia o frontend com `npm run dev`. Para produção, criar uma imagem ou
   artefato estático a partir de `npm run build`, servir `dist/` com suporte às
   rotas da SPA e configurar as URLs públicas da API e do WebSocket. Variáveis
   `VITE_*` são públicas no bundle e não podem conter credenciais. O backend já
   possui a opção `DJANGO_SERVER_MODE=asgi`, que inicia Daphne; a configuração de
   produção ainda precisa remover bind mounts de desenvolvimento, desativar
   debug, configurar hosts/HTTPS e executar `manage.py check --deploy`. Consulte
   o [checklist do Django](https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/).
2. **Escolher os serviços de hospedagem.** Definir onde servir o frontend, onde
   executar o container ASGI com suporte a WebSocket, como fornecer Redis para
   os processos e onde manter os uploads. Supabase pode continuar como banco
   PostgreSQL independentemente de AWS ou Azure. Staging precisa de banco e
   credenciais próprios, separados dos dados de produção.
3. **Construir e identificar a versão.** Depois de CI verde, gerar imagens
   versionadas pelo commit, publicar no registry escolhido e registrar seus
   digests. A promoção deve identificar exatamente a versão testada. As URLs
   públicas do frontend precisam fazer parte da estratégia de configuração do
   artefato, pois hoje são incorporadas durante o build.
4. **Proteger os ambientes e a autenticação.** Criar `staging` e `production`
   com branches permitidas, secrets específicos e aprovação para produção.
   Preferir autenticação federada do GitHub com a nuvem por OIDC e permissões
   limitadas ao ambiente. Segredos de execução, como a conexão do banco e chaves
   de provedores, continuam privados. Veja
   [environments do GitHub](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
   e [OIDC](https://docs.github.com/en/actions/concepts/security/openid-connect).
5. **Controlar migrations.** Planejar backup e recuperação, revisar
   `migrate --plan` e executar migrations em um job explícito, com apenas um
   executor por ambiente. Manter `RUN_MIGRATIONS=false` nos processos normais da
   aplicação. Uma migração incompatível deve ter plano próprio; voltar a imagem
   anterior não desfaz uma alteração de banco automaticamente.
6. **Validar e promover.** Publicar primeiro em staging, verificar saúde do
   backend, acesso ao banco, páginas e conexão WebSocket, e executar os fluxos
   essenciais com contas de teste. Promover a versão aprovada para produção com
   verificação posterior e um procedimento para retornar à versão anterior
   quando o schema permitir.

O uso diário dos dois modos de desenvolvimento fica no
[guia de containers](README.md). A conexão e as migrations remotas seguem o
[guia Supabase](SUPABASE.md); não fazem parte da CI de pull requests.
