"""Guia exibido no início do Swagger e do ReDoc."""

API_DESCRIPTION = """API do Frota Rural: anúncios de maquinário agrícola, reservas, pagamentos e contratos.

## Como testar neste Swagger

As chamadas usam **o mesmo endereço e porta desta página**. Abra uma operação, clique em
**Try it out**, substitua os dados do exemplo e clique em **Execute**. Consulte **Schema**
para os campos obrigatórios, tipos e limites; **Example Value** mostra um preenchimento.
Os UUIDs, nomes, datas e códigos dos exemplos são ilustrativos: use recursos existentes
no seu ambiente de teste, datas disponíveis e o OTP recebido pela parte que assina.

1. Faça `POST /api/login` com uma conta de teste cadastrada. Copie `access`.
2. Clique em **Authorize**, selecione **jwtAuth** e cole somente o token, sem `Bearer`.
3. O acesso dura 15 minutos. `POST /api/login/refresh`, sem corpo, usa o cookie HttpOnly
   recebido no login e devolve outro `access`; atualize o token em **Authorize**.
4. Para alternar entre locatário e locador, faça login com a outra conta e troque o token.
   A autenticação não concede acesso a recursos de outras contas.

## Roteiro: da reserva à assinatura

| Etapa | Operação | Informação a guardar / conferir |
| --- | --- | --- |
| 1. Escolher | `GET /api/postings` e `GET /api/rentals/policy` | Anúncio ativo, agenda livre e data mínima de início. |
| 2. Reservar | `POST /api/rentals` | Envie anúncio, seu usuário locatário e datas. Guarde `id` e `contract_id`. O servidor calcula `total_price` e cria o contrato. |
| 3. Pagar | `POST /api/rentals/{id}/checkout` | Abra `url` no Stripe em ambiente de teste. A reserva tem prazo em `reservation_expires_at`. |
| 4. Confirmar | `GET /api/rentals/{id}/payment` | Aguarde `status=approved`. O retorno do checkout não confirma pagamento; a confirmação chega pelo webhook. |
| 5. Ler | `GET /api/contracts/{id}` | Após o pagamento, leia o documento e guarde `revisao.id` e seu hash. |
| 6. Pedir código | `POST /api/contracts/{id}/otp` | Envie `role` e `revision_id` da revisão lida. Use a conta da própria parte. |
| 7. Assinar | `POST /api/contracts/{id}/sign` | Envie o mesmo `revision_id`, `role`, nome e OTP recebido. Repita as etapas 5–7 com a outra parte. |
| 8. Conferir | `GET /api/contracts/{id}/evidence` | Verifique assinaturas e integridade da cadeia. Com ambas as assinaturas, contrato e locação ficam `signed`. |

**Preço e agenda:** a diária corresponde à tarifa por hora × 8; contam-se os dias de
calendário, incluindo início e fim, com taxa da plataforma de 5%. A cotação fica preservada
na reserva. Consulte a política para a antecedência mínima e respeite disponibilidade,
limite de dias do anúncio e um dia livre entre locações. O horímetro é informativo.

**Alterações:** PATCH de locação aceita observações e, enquanto pendente e sem pagamento
aberto, datas/operador. Não envie `total_price` nem use `status` para avançar o fluxo.
Em uma locação paga, proponha datas em `/contracts/{id}/amendments`: a aprovação pela
outra parte gera nova revisão e exige novas assinaturas. Para cancelar, simule
`/rentals/{id}/cancellation` e use `/cancel`; para concluir, o locador usa `/complete`.

**Recorrência e repetição:** simule `/rentals/{id}/recurrence/preview`, depois crie a série
com uma `idempotency_key` UUID. Reutilize a chave ao repetir a mesma tentativa. Cada reserva
exige pagamento próprio; não há débito automático. Checkout recupera sua tentativa durável;
cancelamento não duplica a obrigação de estorno. Uma solicitação de estorno ainda não é uma
devolução confirmada: acompanhe `refunds`.

## Convenções e diagnóstico

- UUIDs identificam recursos; instantes usam ISO 8601 com fuso, por exemplo `2030-05-10T08:00:00-03:00`.
- Valores monetários de recursos usam strings decimais em reais, como `"2520.00"`.
  O documento do contrato também inclui valores formatados em pt-BR para apresentação.
- Uploads usam `multipart/form-data` quando indicado na operação.
- Erros de aplicação: `{"code":"validation_error","message":"Dados inválidos.","errors":{"campo":["mensagem"]}}`.
  `errors` pode ser vazio; algumas respostas vazias legadas não têm esse corpo.
- `400`: dados inválidos; `401`: sessão ausente/expirada; `403`: ação não autorizada;
  `404`: recurso inexistente ou não visível; `409`: conflito de estado, revisão ou agenda;
  `429`: limite de chamadas; `502/503`: falha ou indisponibilidade de uma integração.
- Guarde o header **X-Request-ID** para localizar a requisição nos logs estruturados.
- O webhook Stripe usa **Stripe-Signature**, sem JWT. Envie eventos pelo Stripe em modo
  de teste; um JSON colado em Try it out não tem assinatura válida.

## Documentação e evidências

No repositório, `Documentation/README_Servicos_Backend.md` contém o guia de execução;
`Documentation/SERVICOS_BACKEND_CATALOGO.md` lista todas as operações;
`Devops/STRIPE.md` explica o sandbox de pagamentos e `Devops/OBSERVABILIDADE.md` descreve
logs, métricas e saúde. O protocolo de chat está em `Documentation/README_Chat_Arquitetura.md`.
O OpenAPI pode ser exportado em `/api/schema?format=json`; o ReDoc está em `/api/schema/redoc`.
"""
