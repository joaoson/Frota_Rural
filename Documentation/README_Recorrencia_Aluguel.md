# T06 — Programar Recorrência de Aluguel

O locatário pode reutilizar uma locação própria para reservar o mesmo anúncio em
múltiplas ocasiões. O fluxo cria uma série finita de novas reservas e contratos,
com datas, disponibilidade e preços verificados pelo servidor.

| Item | Implementação |
| --- | --- |
| Requisito | T06 — Programar Recorrência de Aluguel |
| Dependências funcionais | T01 e T02 |
| Resultado | Reserva de maquinário em múltiplas ocasiões |
| Acesso | Dashboard do locatário → Minhas Locações → Programar recorrência |
| Frequências | Semanal, quinzenal ou mensal |
| Quantidade | De 2 a 12 novas reservas, sem incluir a locação original |

## Fluxo do locatário

1. Na locação que deseja reutilizar, clique em **Programar recorrência**.
2. Escolha a **Primeira data futura**, a frequência e a quantidade de novas
   reservas. O anúncio, o operador e a duração vêm da locação de origem.
3. Clique em **Consultar datas e valores**. A prévia lista cada período, seu valor
   atual e o total. A consulta não cria reservas nem bloqueia datas.
4. Revise a prévia e clique em **Criar N reservas**. A disponibilidade e os preços
   são verificados novamente nessa etapa. Se qualquer período estiver ocupado,
   a série inteira é recusada.
5. Use **Pagar reserva** em cada ocorrência. O botão também fica disponível em
   **Minhas Locações**, permitindo retornar às demais reservas depois do checkout.

Alterar um campo descarta a prévia anterior. Respostas atrasadas de uma consulta
anterior são ignoradas. Durante a criação, os campos e o fechamento do diálogo
ficam bloqueados; cliques repetidos não disparam outra criação simultânea.

## Datas e informações reutilizadas

A primeira data precisa ser posterior à data atual do servidor. Cada ocorrência
preserva o horário de início e a duração da locação original, além do anúncio,
locatário e operador vinculado. O anúncio e a máquina devem estar ativos; um
operador com status explicitamente inativo impede a programação.

Semanal avança sete dias; quinzenal avança quatorze. Mensal mantém o dia escolhido
como referência: **31 de janeiro → 28/29 de fevereiro → 31 de março**. O ajuste
para o último dia de um mês curto não muda a referência dos meses seguintes.

O backend respeita a janela de disponibilidade e o máximo de dias por reserva do
anúncio. Também verifica conflitos com reservas existentes e entre as novas
ocorrências, incluindo o intervalo de limpeza de um dia. As verificações de
ocupação abrangem todos os anúncios da mesma máquina.

A locação original permanece inalterada. Os novos contratos começam em
`pending_signatures`, sem aceite de nenhuma das partes. Assinaturas, pagamentos,
leituras de horímetro e estados de execução anteriores não são copiados.
O contrato só pode ser assinado depois da confirmação do pagamento. Uma
assinatura não ativa uma reserva ainda não paga nem recupera datas ocupadas por
outra reserva.

## Preços, pagamento e reservas provisórias

Os valores são calculados no servidor com o preço atual do anúncio, usando a
mesma regra do checkout existente: dias corridos inclusivos × oito horas por
diária × valor/hora, mais 5% de taxa da plataforma, com arredondamento monetário.
O total antigo da locação de origem não determina o preço das novas reservas.

Preço e disponibilidade podem mudar entre a prévia e a criação. A resposta de
criação mostra os valores efetivamente registrados. Ao iniciar um checkout novo,
o servidor revalida a disponibilidade e recalcula o valor atual; uma sessão de
checkout já aberta é reutilizada com o valor que já contém.

Todas as ocorrências são criadas como `pending`, com reserva provisória por
**30 minutos após a criação**. A expiração está em `reservation_expires_at`.
Depois do prazo, uma reserva não paga deixa de bloquear as datas na consulta de
disponibilidade; a passagem do tempo, sozinha, não exclui o registro. Ainda é
possível tentar pagar depois se o período continuar livre e futuro.

Cada reserva tem checkout separado. Criar a série não cobra o usuário, não salva
uma autorização de débito futuro e não cria uma assinatura Stripe. Ao abrir o
checkout, a reserva passa a `awaiting_payment` e o prazo acompanha a expiração
da sessão Stripe, configurada para aproximadamente 31 minutos a partir da
abertura. O minuto adicional atende à janela mínima do provedor.

O webhook confirma cada pagamento independentemente. Uma confirmação tardia não
pode ocupar datas que já foram reservadas por outra pessoa nem reativar uma
reserva em estado incompatível: o pagamento passa a `requires_review`, e a
reserva não é confirmada. Na tela de retorno, o usuário recebe a orientação de
procurar o suporte com o código da reserva e não pagar novamente enquanto aguarda
a análise. Essa condição não dispara estorno automático; a equipe deve analisar
o pagamento no provedor e resolver o caso.

Um evento de checkout concluído só confirma a reserva quando o Stripe informa
`payment_status=paid`. Meios de pagamento com confirmação posterior usam os
eventos `checkout.session.async_payment_succeeded` e
`checkout.session.async_payment_failed`. A aplicação não inicia outro checkout
para uma reserva com pagamento recebido ou em análise. Consulte a
[orientação oficial do Stripe](https://github.com/stripe/ai/blob/main/skills/stripe-best-practices/references/payments.md)
e a [janela de expiração de sessões](https://docs.stripe.com/api/checkout/sessions/create#checkout_session_create-expires_at).

## API

Ambos os endpoints exigem autenticação e pertencimento da locação de origem ao
usuário. Uma locação de outro locatário retorna `404`.

Consultas de locações, contratos e evidências exigem autenticação e são limitadas
ao locatário ou ao proprietário da máquina. O calendário usa o endpoint público
`GET /api/postings/{id}/ocupacao`, que informa somente períodos e estados de
ocupação. Alterações genéricas não podem transferir a locação para outra pessoa,
trocar seu anúncio ou saltar o pagamento; preços são calculados no servidor.
Leituras de horímetro e conclusão da locação ficam limitadas ao locador no estado
adequado. Reservas com histórico de pagamento não podem ter datas alteradas.

| Método e caminho | Resultado |
| --- | --- |
| `POST /api/rentals/{id}/recurrence/preview` | Prévia, sem persistência, HTTP 200 |
| `POST /api/rentals/{id}/recurrence` | Série, novas reservas e contratos, HTTP 201 |

Corpo da prévia, usando uma data futura válida no momento do teste:

```json
{
  "first_start_date": "2027-01-15",
  "frequency": "weekly",
  "occurrences": 3
}
```

Na criação, envie os mesmos campos e `idempotency_key`, um UUID gerado para essa
tentativa. São aceitos `weekly`, `biweekly` e `monthly`. Preço, status, locatário,
operador ou anúncio enviados pelo cliente são recusados; esses dados são obtidos
da origem e calculados no servidor.

A prévia retorna `source_rental`, `frequency`, `occurrences`, `total_price` e
`dates`, com início, fim e valor de cada período. A criação retorna também o ID
da série, `first_start_date`, `reservation_expires_at` e `rentals`, com o índice
de cada ocorrência. Valores monetários são strings decimais.

Dados inválidos retornam `400`; ausência de autenticação retorna `401`; conflitos
de disponibilidade retornam `409`. Para conflito em um período, a resposta
identifica a ocorrência e a data quando disponíveis.

## Consistência e concorrência

Criação da série, reservas e contratos acontece em uma única transação. Um
conflito ou falha ao criar qualquer contrato desfaz toda a operação.

O PostgreSQL bloqueia a linha do locatário para serializar tentativas com a mesma
chave de idempotência e a linha do anúncio antes da última checagem de
disponibilidade. Reserva avulsa, recorrência, checkout e processamento de webhook
usam os bloqueios do anúncio e da máquina para evitar a confirmação concorrente das mesmas
datas.

Repetir a criação com a mesma chave, locação e parâmetros devolve a série já
criada, mesmo se preços ou disponibilidade tiverem mudado depois. Reutilizar a
chave para outra programação retorna `409`. O frontend mantém a chave ao repetir
uma tentativa após erro de conexão enquanto o formulário continua com os mesmos
campos. Uma nova programação recebe outra chave.

## Dados e migrations

`api.0005_rental_recurrence` adiciona `rental_recurrences`, a associação em
`rentals`, o índice da ocorrência e restrições para quantidade e unicidade.
`api.0006_rental_reservation_expiry` adiciona `reservation_expires_at`.

As reservas antigas permanecem compatíveis: quando não há expiração explícita,
as reservas provisórias usam o prazo legado de 30 minutos a partir de
`created_at`. Reservas canceladas e reservas provisórias vencidas não bloqueiam
novas datas. Reservas confirmadas continuam bloqueando seus períodos.

## Validação

A cobertura inclui autorização, validação de campos, virada de mês e ano,
preços atuais, contratos novos, transações sem criação parcial, expiração,
idempotência e concorrência real no PostgreSQL. Os testes de navegador percorrem
o dashboard, a prévia, a criação, os conflitos e a retomada de pagamento.

Os resultados consolidados desta revisão serão registrados no
[relatório de integração](README_Merge_Readiness.md). Pagamento e provedores
externos são simulados nos testes automatizados; isso não constitui validação de
uma cobrança real.

## Supabase e escopo desta entrega

A conexão com o projeto Supabase foi verificada pelo session pooler com TLS.
**As 47 migrations, incluindo T05, foram aplicadas e o backend Docker está conectado ao banco
remoto.** Existem 27 tabelas no schema privado `frota_rural`, nenhuma no schema
`public` e nenhuma migration pendente. As verificações da API em execução
passaram. Os usuários, anúncios e aluguéis locais não foram copiados. O
[seed de demonstração](../Devops/SEED.md) foi aplicado separadamente, incluindo
histórico fictício para experimentar a recorrência e notificações iniciais.

O [guia Supabase](../Devops/SUPABASE.md) explica a configuração de TLS, o schema
privado `frota_rural`, a verificação sem exposição de senhas e as migrations
explícitas. O ambiente em execução usa o override Supabase; a configuração padrão
continua disponível para retornar ao PostgreSQL local. Redis permanece no Docker.
Autenticação, armazenamento de arquivos e Groq mantêm suas integrações.

T06 cria de 2 a 12 reservas de uma vez. Esta entrega não inclui geração infinita
por agendador, cobrança automática, edição/cancelamento da série inteira ou
transferência dos dados locais para o Supabase. Cada ocorrência segue o fluxo
individual de locação e contrato.
