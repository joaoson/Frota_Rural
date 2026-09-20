# Dados de demonstração

O `BackEnd/seed.py` preenche uma instalação de desenvolvimento sem apagar ou
atualizar os registros existentes. Os IDs são estáveis: executar novamente
preserva edições, senhas, datas, prazos de reserva e notificações já lidas ou
dispensadas. Se um e-mail, documento ou RENAGRO de demonstração já pertencer a
outro registro, toda a operação é recusada. Uma falha durante a inserção desfaz
a operação inteira.

## Conferir e executar

Primeiro aplique as migrações, incluindo o app `notifications`. No Docker local:

```bash
docker compose exec backend python seed.py --dry-run
docker compose exec backend python seed.py
```

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

São contas fictícias, sem privilégio de administrador. O domínio reservado
`example.test` não recebe e-mails. Para uma senha inicial diferente, defina
`SEED_DEMO_PASSWORD` no ambiente do processo antes da primeira execução; o seed
nunca redefine senhas já criadas. Não use essas contas como contas reais.

## Inventário e fluxos

Uma instalação vazia recebe 88 registros:

| Dados | Quantidade |
| --- | ---: |
| Usuários | 6 |
| Certificações fictícias aguardando análise | 2 |
| Máquinas | 20 |
| Anúncios ativos | 20 |
| Locações | 8 |
| Contratos sem assinatura | 4 |
| Mensagens de conversa | 8 |
| Avaliações de locações concluídas | 4 |
| Notificações privadas para as partes | 16 |

Maria e Pedro têm, cada um, duas locações concluídas no histórico para testar
**Programar recorrência**, uma reserva futura pendente para testar o checkout e
uma reserva cancelada. Cada proprietário tem dez anúncios. A disponibilidade dos
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
Não há URLs falsas de fotos ou documentos: os anúncios usam o estado sem foto da
interface. Para validar assinatura com OTP, use uma conta própria com e-mail
recebível e o fluxo de pagamento de teste configurado da aplicação.
