# Stripe local em modo de teste

O app usa o Checkout hospedado pelo Stripe. Basta uma chave secreta `sk_test_`
no backend; não utiliza chave publicável nem Stripe.js no frontend. O pagamento
só é confirmado quando o webhook recebe a confirmação do Stripe.

## Preparar e iniciar

1. Inicie o backend deste checkout e confirme que o banco está disponível.
   Se o Supabase estiver pausado ou mostrando **Coming up…**, espere a restauração
   e execute `docker exec frota_rural_retrofit-backend-1 python manage.py verify_database`.
   O override Supabase mantém `RUN_MIGRATIONS=false`.
2. Guarde `STRIPE_SECRET_KEY=sk_test_…` no arquivo ignorado `BackEnd/.env`, sem
   colocar a chave em comandos, commits ou mensagens. Reinicie o backend para
   carregá-la. Variáveis do processo/Compose têm prioridade sobre esse arquivo.
   Mantenha `STRIPE_WEBHOOK_SECRET` fora do ambiente Compose para que o helper
   possa atualizar esse valor em `BackEnd/.env`.
3. Na raiz do checkout, com Python 3 e Docker disponíveis, execute:

   ```bash
   python3 Devops/stripe_local.py
   ```

   Para nomes personalizados:

   ```bash
   python3 Devops/stripe_local.py --backend frota_rural_retrofit-backend-1 --listener frota_rural_retrofit-stripe-listener
   ```

O helper confirma que o backend monta o `BackEnd` deste checkout, verifica o
banco apenas com leitura e recusa chaves live. Usa a imagem oficial
`stripe/stripe-cli` fixada em
`sha256:11c46caeead82e329f14823dd622d494b4cc8c1b9766f724d122d2af42c97540`.
A chave é passada pelo ambiente do subprocesso, sem aparecer nos argumentos
ou na saída. Logs do CLI contêm o segredo de assinatura: não os compartilhe.

O listener usa `--events-from @self`, dispositivo `frota-rural-local`, telemetria
desativada e encaminha para `http://127.0.0.1:8000/api/payments/webhook` dentro
da rede do backend. Recebe `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.expired` e
`checkout.session.async_payment_failed`, `refund.updated`, `refund.failed` e
`charge.refunded`. O helper grava somente
`STRIPE_WEBHOOK_SECRET` em `BackEnd/.env`, com permissão `600`, reinicia backend
e listener e verifica que o segredo efetivo coincide com o listener atual.

Deixe o listener rodando durante os testes. Execute o helper novamente depois
de **recriar/reconstruir o container backend**, pois o listener usa seu ID de
rede. O listener é separado do Compose; `docker compose up` não o configura.
Se o backend estiver parado após reiniciar o Docker Desktop, inicie-o antes do
helper. Um container com nome conflitante e configuração desconhecida é
recusado, sem remoção; escolha outro `--listener` se necessário.

## Conferir o fluxo

Use uma reserva futura e finalize o Checkout **em modo de teste** com o cartão
`4242 4242 4242 4242`, validade futura e CVC de três dígitos. O retorno deve
confirmar o pagamento, ativar a locação e abrir o contrato. Assinar o contrato
é uma etapa separada e exige o serviço de e-mail/OTP; contas `example.test`
não recebem e-mail. Veja os [cartões de teste oficiais](https://docs.stripe.com/testing).

Esse teste pela aplicação altera o banco configurado. Para preservar o Supabase,
use PostgreSQL e contas locais conforme [o guia de testes](../FrontEnd/tests/README.md).
O helper não cria reservas, pagamentos ou sessões de Checkout; apenas configura
o listener e faz verificações de leitura. O listener pode processar eventos
de sessões existentes da mesma conta Stripe enquanto estiver ativo.

Um webhook HTTP 200 de uma sessão sem registro no app confirma transporte e
assinatura, mas não comprova o fluxo de pagamento de uma locação. A página de
sucesso também não substitui o webhook. O segredo emitido pelo CLI é diferente
do segredo de um endpoint criado no Dashboard; consulte
[a documentação de webhooks](https://docs.stripe.com/webhooks).

Este procedimento serve ao desenvolvimento local em modo de teste. Para parar
o encaminhamento sem apagar dados:

```bash
docker stop frota_rural_retrofit-stripe-listener
```

## Regressão de leitura do evento

O SDK Stripe retorna `StripeObject`, que não oferece `dict.get()`. Esse uso
causava HTTP 500 no evento e na sessão, mesmo com assinatura válida. O serviço
usa acesso por chave e checagem de presença. Os testes usam o parser real do
SDK com payloads assinados e não acessam a rede:

```bash
docker exec NOME_DO_BACKEND_LOCAL python manage.py test payments.test_webhook
```

Nos ambientes de `Devops/dev.py`, as credenciais são carregadas exclusivamente
pelo arquivo selecionado (`.env.local` ou `.env.supabase`), conforme
[DEVELOPMENT.md](DEVELOPMENT.md). A configuração acima de `stripe_local.py`
pertence ao Compose legado que carrega `BackEnd/.env`; não a execute contra um
backend com `STRIPE_WEBHOOK_SECRET` fornecido pelo ambiente. Nesse caso,
configure a chave e o segredo do listener no arquivo selecionado e recrie o
backend com o mesmo modo/offset antes de encaminhar os eventos.

## Tentativas duráveis e conciliação

Cada checkout grava antes uma tentativa em `payments` (status `creating`) com a
chave de idempotência `checkout:<locação>:<n>` e os parâmetros exatos da sessão. O
Stripe é chamado fora dos locks da reserva; se a resposta se perder, uma nova
tentativa do locatário repete a mesma chave e recebe a mesma sessão, sem criar
outra. A sessão leva `payment_id` em `metadata`, então o webhook liga a sessão à
tentativa mesmo quando a gravação local falhou. Cada evento recebido fica em
`payment_events` e é aplicado uma única vez.

O que a resposta síncrona e o webhook não fecharam é resolvido por:

```bash
docker exec NOME_DO_BACKEND_LOCAL python manage.py reconcile_payments
```

O comando repete tentativas incertas com a mesma chave, expira no Stripe sessões
de reservas já canceladas, aplica pagamentos ou expirações cujo webhook não
chegou e lista os pagamentos em revisão. Ele é idempotente; em produção, rode-o
periodicamente (cron ou job agendado), já que o projeto não tem agendador próprio.

## Cancelamento, estorno e prazo de assinatura (H)

A prévia `GET /api/rentals/<id>/cancellation` informa a regra congelada na reserva:
sem pagamento, sem custo; pelo locatário com pelo menos 7 dias, 100%; com menos
antecedência, 90%; pelo locador, 100%. Após o início, somente a administração.
`POST /api/rentals/<id>/cancel` recebe `reason` e libera as datas antes de chamar
o provedor. Não use PATCH de status para cancelar ou concluir.

`refunds` guarda a obrigação de estorno e `refund_attempts` cada tentativa remota.
Timeouts repetem a mesma chave; uma nova chave só nasce após falha terminal
confirmada pelo Stripe. Depois de 23 horas, uma tentativa sem resposta é procurada
por metadata no provedor; se não houver evidência, exige revisão manual, sem
reenviar uma chave que o Stripe possa ter esquecido. `reconcile_payments` também
recupera estornos pendentes/falhos. Nunca altere o status da reserva para tentar
recuperar um estorno. Webhooks necessários: `refund.updated`, `refund.failed` e
`charge.refunded`, além dos eventos de checkout já configurados.

Novas revisões recebem `signature_deadline = start_date - 24 horas`. Assinaturas
e pedidos de OTP vencidos retornam 409. O comando `expire_unsigned_contracts`
cancela contratos vencidos sem as duas assinaturas e solicita estorno integral.
Contratos legados sem prazo não recebem uma data retroativa. O lembrete antecipado
continua na Fase 5.

O repositório não instala um agendador no servidor. Após o deploy e as migrations,
configure o job abaixo (exemplo a cada cinco minutos, com caminhos absolutos e o
nome real do container); também é possível executá-lo manualmente:

```sh
/opt/frota/Devops/reconcile-contracts.sh NOME_DO_BACKEND
# crontab do operador do deploy:
*/5 * * * * /opt/frota/Devops/reconcile-contracts.sh NOME_DO_BACKEND >> /var/log/frota-contracts.log 2>&1
```

Os dois comandos são idempotentes. A frequência do job determina o atraso entre
o vencimento e a liberação das datas; a recusa de assinatura vale imediatamente.
Monitore os registros `refunds.status=failed`, `last_error` e pagamentos em revisão.
Uma falha de estorno não reabre a reserva cancelada.

## Troca de datas (I)

Ambas as partes podem propor pelo cartão da locação ou pela página do contrato.
A outra parte aceita ou recusa; quem propôs pode retirar. O período original vale
até o aceite. A aceitação verifica novamente os conflitos e a antecedência mínima,
preserva a quantidade de diárias e o valor pago, e cria nova revisão para as duas
assinaturas. Não cria pagamento adicional. O histórico e as evidências anteriores
permanecem; o documento atual mostra somente as assinaturas da revisão vigente.

Para demonstrar: entre como locatário e solicite novas datas; em outra sessão,
entre como locador, abra o contrato e aceite. Confira a revisão incrementada, as
duas assinaturas pendentes e o preço inalterado. Os testes de navegador em
`FrontEnd/tests/contract-management.spec.ts` exercitam esse fluxo e um cancelamento
pago com falha recuperável de estorno, sem movimentar dinheiro no Stripe.
