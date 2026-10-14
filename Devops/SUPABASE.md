# Supabase como PostgreSQL do Django

Esta integração muda somente o banco. Login/JWT, arquivos e Groq continuam nas
integrações atuais. O navegador acessa a API Django; não recebe senha do banco,
`service_role`, chave anônima nem uma nova biblioteca Supabase.

Na branch `main`, `python3 Devops/dev.py up` escolhe esta conexão automaticamente.
`develop`, `acceptance` e branches de feature usam banco local. Este guia mantém
modos explícitos nos comandos de manutenção para identificar o destino mesmo
quando consultado em outra branch. Veja [o início rápido](QUICK_START.md).

## 1. Guardar a conexão localmente

No projeto Supabase, abra **Connect → Session pooler**, porta **5432**. Copie o
host e usuário exatos do painel. O pooler funciona em redes IPv4; a conexão direta
é outra opção quando a rede suporta IPv6. A porta **6543** usa transações e é
recusada pela configuração deste projeto. Consulte as
[opções oficiais de conexão](https://supabase.com/docs/guides/database/connecting-to-postgres).

Na raiz do repositório:

```bash
cp .env.supabase.example .env.supabase
chmod 600 .env.supabase
```

Abra `.env.supabase` no editor e preencha `DATABASE_URL` com a URI copiada do
painel, substituindo a senha **nesse arquivo**. Não envie a senha no chat nem a
coloque em comandos, screenshots ou commits. O arquivo é ignorado pelo Git e pelo
contexto de build do Docker. Se ele já existe, edite-o sem executar `cp` novamente.

```dotenv
DATABASE_URL='postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require'
DB_SCHEMA=frota_rural
DB_SSLMODE=require
```

Na senha da URI, caracteres reservados precisam de percent-encoding: `@` vira
`%40`, `#` vira `%23`, `/` vira `%2F`, `%` vira `%25` e `?` vira `%3F`.
Mantenha as aspas simples para impedir interpolação de `$` pelo Compose.

`sslmode=require` exige criptografia. Para também verificar a identidade do
servidor, baixe o certificado do projeto em **Database settings → SSL Configuration**,
salve em `BackEnd/certs/`, troque a URI para `sslmode=verify-full` e defina
`DB_SSLROOTCERT=/app/certs/NOME_DO_CERTIFICADO.crt`. A
[documentação de SSL](https://supabase.com/docs/guides/platform/ssl-enforcement)
explica verificação e a opção de exigir SSL no servidor; alterar essa opção reinicia
brevemente o banco.

## 2. Criar um schema privado, antes das migrations

Use o SQL Editor do projeto correto para executar explicitamente:

```sql
CREATE SCHEMA IF NOT EXISTS frota_rural AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA frota_rural FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA frota_rural
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA frota_rural
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA frota_rural
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
```

Este SQL usa o usuário `postgres` fornecido pelo painel. Se configurar um usuário
próprio, ajuste proprietário e privilégios conscientemente. Não altere schemas
gerenciados do Supabase (`auth`, `storage`, etc.).

Mantenha `frota_rural` fora dos **Exposed schemas** da Data API. Para um projeto
usado somente pelo Django, também pode desativar a Data API nas configurações do
projeto. Veja [segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api).
As migrations do Django não criam políticas RLS: o controle de acesso continua na
API Django. Por isso não crie suas tabelas no schema público exposto pelo Supabase.

O backend usa `search_path=frota_rural` sem fallback para `public`. Se o schema
estiver ausente, o verificador falha e migrations não criam tabelas em outro schema.
Nenhuma criação de schema ou alteração de privilégios acontece no startup.

## 3. Verificar e aplicar migrations explicitamente

Requer Docker Compose **2.24.4+** e Python **3.10+** no host. O script seleciona
somente `.env.supabase`; acrescente nesse arquivo as chaves das integrações que
quiser usar. Ele não importa `.env` nem `BackEnd/.env`. Mais opções de portas,
projetos e isolamento de código estão em [DEVELOPMENT.md](DEVELOPMENT.md).

```bash
python3 Devops/dev.py supabase config
python3 Devops/dev.py supabase up
python3 Devops/dev.py supabase check-db
python3 Devops/dev.py supabase plan-migrations
```

`up` constrói as imagens e inicia o app sem migrations automáticas. Os dois
últimos comandos são somente leitura; o verificador imprime host, banco, schema
e TLS sem senha. Confira o destino e a lista de migrations. Para um banco
existente, faça backup antes de mudar sua estrutura. Para aplicar a lista revisada:

```bash
python3 Devops/dev.py supabase migrate --allow-remote
```

O override remove a dependência do PostgreSQL local e mantém Redis no Docker
para o chat. Frontend e API usam portas 5174 e 8001 por padrão. Se outra
instalação já usa essas portas, escolha outro `--port-offset` em todos os
comandos; o script cria um projeto separado, sem substituir o antigo.

Isso instala a estrutura em um banco novo; **não copia usuários, anúncios,
locações ou uploads locais**. A migração de dados existentes é uma operação
separada. Para adicionar dados fictícios mediante solicitação, use o seed
repetível com `--dry-run` e depois `--allow-remote`, conforme o
[guia de demonstração](SEED.md). Ele preserva os dados existentes e não faz
pagamentos nem envia mensagens externas. Não rode a suíte de testes contra o
projeto Supabase.

## Voltar ao banco local e rodar testes

Use o ambiente local independente:

```bash
python3 Devops/dev.py local up
python3 Devops/dev.py local test
```

Os bancos, cookies e volumes dos modos permanecem independentes. O comando
`python3 Devops/dev.py local down` preserva os volumes. Se ambos os modos usam
este checkout, compartilham as edições do código; use outro worktree para manter
a versão Supabase estável enquanto experimenta localmente.

## Configuração sem Docker

As variáveis do processo têm prioridade, seguidas por `BackEnd/.env` e `.env`
da raiz. O carregador não lê `.env.supabase` automaticamente: esse isolamento
mantém os testes e o desenvolvimento local separados do banco remoto. Para
execução nativa, configure `DATABASE_URL` e `DB_SCHEMA` em `BackEnd/.env` ou use
um gerenciador local de variáveis de ambiente que não grave segredos no histórico.

Uma `DATABASE_URL` válida substitui todos os campos de conexão `DB_*` e
`POSTGRES_*`. Opções da URI têm prioridade sobre `DB_SSLMODE`, `DB_SSLROOTCERT`
e `DB_CONNECT_TIMEOUT`; `DB_SCHEMA` configura somente o search path.

O startup usa `RUN_MIGRATIONS=auto`: executa migrations apenas para host local
(`db`, `localhost`, `127.0.0.1`, `::1`) sem `DATABASE_URL`. `false` desativa e
`true` autoriza explicitamente migrations automáticas. O override Supabase fixa
`false`; a instalação remota sempre usa o comando `migrate` explícito.

Em caso de falha no verificador, confira a senha do banco (diferente da senha da
conta Supabase), o usuário `postgres.PROJECT_REF`, host exato do pooler, porta
5432, disponibilidade do projeto, permissões do schema e certificado. O erro
original do driver é omitido para evitar vazamento de credenciais.
