# Dados de demonstração

Para os ambientes isolados, use `python3 Devops/dev.py local seed-preview` e
`python3 Devops/dev.py local seed`. No modo Supabase, use `supabase seed-preview`
e `supabase seed --allow-remote` somente após conferir o destino. Acrescente as
mesmas opções de porta/projeto usadas no `up`; veja [DEVELOPMENT.md](DEVELOPMENT.md).
Os comandos Compose diretos abaixo continuam disponíveis para instalações anteriores.

O `BackEnd/seed.py` preenche uma instalação de desenvolvimento sem apagar os
registros existentes. Por padrão, apenas insere os que faltam. Os IDs são estáveis: executar novamente
preserva edições, senhas, datas, prazos de reserva e notificações já lidas ou
dispensadas. Se um e-mail, documento ou RENAGRO de demonstração já pertencer a
outro registro, toda a operação é recusada. Uma falha durante a inserção desfaz
a operação inteira.

Para completar os textos originais do seed anterior e perfis sem foto, use
`--enrich-demo`. Essa opção atualiza somente campos vazios ou iguais aos valores
originais de demonstração: ficha técnica, descrição, observações e endereço/foto
do perfil. Edições próprias, fotos existentes, senhas, preços, estados e datas
permanecem intactos. As contagens distinguem criações, registros existentes e
enriquecimentos; `seed-preview` não grava nenhuma dessas mudanças.

## Conferir e executar

Primeiro aplique as migrações, incluindo o app `notifications`. No Docker local:

```bash
docker compose exec backend python seed.py --dry-run
docker compose exec backend python seed.py
```

Neste worktree, o frontend usa a porta **5175** e a API, **8002**. Para enriquecer
o banco local existente, cujo administrador já foi criado separadamente:

```bash
python3 Devops/dev.py local seed-preview --port-offset 2 --enrich-demo --skip-admin
python3 Devops/dev.py local seed --port-offset 2 --enrich-demo --skip-admin
```

O helper monta automaticamente `--asset-base-url http://localhost:5175/demo` a
partir da porta selecionada. Na execução direta de `seed.py`, informe a URL do
frontend explicitamente se ela não for `http://localhost:5173/demo`. Também é
possível definir `SEED_ASSET_BASE_URL`; para sites publicados, use o domínio do
frontend em `--asset-base-url https://seu-site.example/demo`. URLs já salvas são
preservadas em reexecuções, então escolha a origem correta na primeira carga.

Com o backend já conectado ao Supabase, revise a previsão e autorize a inserção
remota explicitamente:

```bash
docker compose --env-file .env --env-file .env.supabase -f compose.yaml -f compose.supabase.yaml exec backend python seed.py --dry-run
docker compose --env-file .env --env-file .env.supabase -f compose.yaml -f compose.supabase.yaml exec backend python seed.py --allow-remote
```

O comando usa o banco configurado **no container em execução**. Os arquivos de
ambiente no comando Compose não trocam a conexão de um container já iniciado;
confira antes com `python manage.py verify_database` dentro do backend. Não
execute a suíte de testes no Supabase. A inserção demonstração não importa nem
substitui dados do PostgreSQL local.

Se houver mais de um container do serviço backend (por exemplo, um container
temporário de testes), use `docker exec NOME_DO_CONTAINER` e confirme a conexão
com `verify_database`; o comando `compose exec` pode selecionar o container
temporário.

## Contas

| Papel | E-mail | Senha inicial |
| --- | --- | --- |
| Locador João | `joao.silva@example.test` | `Teste1234` |
| Locatária Maria | `maria.oliveira@example.test` | `Teste1234` |
| Locadora Ana | `ana.pereira@example.test` | `Teste1234` |
| Locatário Pedro | `pedro.costa@example.test` | `Teste1234` |
| Operador de Maria | `carlos.santos@example.test` | `Teste1234` |
| Operadora de Pedro | `fernanda.lima@example.test` | `Teste1234` |
| Administrador | `admin@example.test` | `Teste1234` |

São contas fictícias. O perfil `admin` permite gerenciar usuários e moderação
na aplicação, com entrada em `/admin/users`. O domínio reservado
`example.test` não recebe e-mails. Para uma senha inicial diferente, defina
`SEED_DEMO_PASSWORD` no arquivo selecionado pelo helper (ou no ambiente do
processo na execução nativa) antes da primeira execução; o seed
nunca redefine senhas já criadas. Não use essas contas como contas reais.

Se `admin@example.test` já foi criado fora do seed, ele terá outro ID e a
verificação de conflito interromperá a execução sem alterar dados. A conta
existente pode continuar sendo usada na extensão com suas próprias credenciais;
o seed não a substitui nem promove contas existentes a administrador. Use
`--skip-admin` para omitir inteiramente essa conta do inventário e continuar com
os demais dados. Essa opção não exclui, desativa nem altera administradores.

## Inventário e fluxos

Uma instalação vazia recebe **354 registros** no modo detalhado, que é o padrão:

| Dados | Quantidade |
| --- | ---: |
| Usuários | 7 |
| Certificações fictícias aguardando análise | 2 |
| Máquinas | 20 |
| Anúncios ativos | 20 |
| Fotos nos anúncios | 37 |
| Locações | 32 |
| Contratos sem assinatura | 16 |
| Mensagens de conversa | 104 |
| Avaliações de locações concluídas | 28 |
| Leituras de horímetro | 24 |
| Notificações privadas para as partes | 64 |

Maria e Pedro têm, cada um, oito locações concluídas no histórico para testar
**Programar recorrência**, cinco reservas pendentes para testar o checkout e
três canceladas. As 24 locações acrescentadas ao inventário original trazem
planejamento de área/cultura, logística de retirada e devolução, operador e quatro
mensagens. As 12 concluídas adicionais incluem horímetros de entrada/saída e
avaliações das duas partes. As quatro canceladas adicionais têm motivo, autor e
data do cancelamento. As novas reservas procuram uma janela livre dentro da
disponibilidade, respeitando a duração máxima e as reservas em vigor.

Cada proprietário tem dez anúncios. A disponibilidade inicial dos
anúncios cobre os próximos dois anos; a duração máxima de cada reserva é de 14
dias. Os preços seguem a regra da aplicação: oito horas por diária, datas
inclusivas e taxa de 5%.

As reservas pendentes têm a mesma retenção de 30 minutos da aplicação; repetir o
seed não renova esse prazo. O checkout pode revalidar datas e iniciar um novo
prazo. As notificações iniciais aparecem no sino de João, Maria, Ana e Pedro.
Reexecutar o seed não gera novos avisos para locações existentes.

O histórico é fictício e não inclui contratos antigos, pagamentos Stripe nem
evidências de aceite. Os contratos das reservas futuras começam sem assinatura;
os das reservas canceladas estão cancelados. O seed não faz pagamentos, não
envia e-mails, não cria assinaturas eletrônicas e não chama serviços externos.
Para validar assinatura com OTP, use uma conta própria com e-mail
recebível e o fluxo de pagamento de teste configurado da aplicação.

## Fotografias e perfis

As galerias usam 33 fotografias locais do Wikimedia Commons, com licenças CC BY,
CC BY-SA ou CC0 e créditos por arquivo. Algumas representam outra versão da mesma
marca/categoria, conforme informado no anúncio. Os seis retratos de perfil foram
gerados por IA e representam pessoas fictícias. Os arquivos ficam em
[`FrontEnd/public/demo`](../FrontEnd/public/demo/README.md), com fontes, licenças,
checksums e prompts. Créditos visuais: [localhost:5175/demo/credits.html](http://localhost:5175/demo/credits.html).

As imagens são servidas pelo frontend e incluídas no build; não precisam de
Firebase, chave de API nem acesso ao Wikimedia durante a carga ou a navegação.
Uma capa existente continua como capa, e as fotos do seed entram na galeria.
Se um Vite já em execução devolver HTML em vez das imagens recém-adicionadas,
reinicie somente o serviço frontend para atualizar o inventário de arquivos públicos.
`--basic` mantém o inventário original de 89 registros, sem acrescentar galerias
ou o histórico ampliado, para ambientes que precisam da carga mínima.
