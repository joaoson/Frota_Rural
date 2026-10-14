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
`checkout.session.async_payment_failed`. O helper grava somente
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
