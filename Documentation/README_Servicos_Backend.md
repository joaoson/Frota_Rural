# Serviços backend

O [catálogo completo](SERVICOS_BACKEND_CATALOGO.md) descreve cada operação HTTP, seu sumário e respostas. Ele deriva do OpenAPI validado; Swagger e ReDoc estão em `/api/schema/swagger-ui` e `/api/schema/redoc`. As URLs usam o endereço do backend selecionado pelo ambiente, normalmente porta 8000, com prefixo `/api` e sem barra final.

## Contrato de uso

Faça `POST /api/login` com `email` e `password`, envie o `access` em `Authorization: Bearer <token>` e use o cookie HttpOnly de refresh para renovar a sessão. O browser deve enviar credenciais na renovação. A autorização continua sendo aplicada em cada domínio: autenticar não concede acesso a recursos de outras contas.

```bash
curl -X POST "$API_URL/login" -H 'Content-Type: application/json' \
  --data '{"email":"conta-de-teste@example.com","password":"senha-de-teste"}'
curl "$API_URL/notifications?unread=true&limit=20&offset=0" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Configure `API_URL` para o backend local de teste. Não copie tokens, senhas ou dados reais para evidências.

UUIDs identificam recursos. Instantes usam ISO 8601 com fuso; valores monetários usam decimais representados como strings na API. Uploads usam `multipart/form-data` conforme o schema. Erros de aplicação são normalizados para `{"code":"validation_error","message":"Dados inválidos.","errors":{"campo":["mensagem"]}}`. Algumas respostas vazias legadas, como 404 de uma notificação já excluída, não têm esse corpo. `X-Request-ID` permite correlacionar a resposta com o log HTTP.

## Operações críticas e repetição

- **Reserva e cotação:** a política de antecedência vem de `/rentals/policy`. O preço é calculado no servidor e preservado; editar anúncio não muda o acordo existente.
- **Recorrência:** envie `first_start_date`, `frequency` (`weekly`, `biweekly` ou `monthly`) e `occurrences` (2–12) à prévia. Na criação, acrescente `idempotency_key` UUID e reutilize a mesma chave após perda de resposta. A criação é atômica e cada ocorrência tem contrato, prazo e pagamento independentes.
- **Pagamento:** `POST /rentals/{id}/checkout` cria/recupera uma tentativa durável. Consulte `/rentals/{id}/payment` depois do retorno; o redirecionamento não confirma pagamento.
- **Webhook:** `POST /payments/webhook` recebe corpo original e `Stripe-Signature`, sem JWT. O serviço verifica a assinatura e processa repetições com segurança. Um corpo reformatado invalida a assinatura. Use [Stripe sandbox](../Devops/STRIPE.md) para uma demonstração externa.
- **Cancelamento:** GET `/rentals/{id}/cancellation` simula; POST `/rentals/{id}/cancel` recebe `reason`. Liberação de datas e solicitação de estorno são diferentes da confirmação de devolução pelo provedor. Consulte `refunds` e seus estados.
- **Contratos:** propostas de datas usam `/contracts/{id}/amendments` e ações `accept`, `reject`, `withdraw`. A aprovação exige disponibilidade e nova revisão. As assinaturas e OTP estão vinculados à revisão exibida; consulte `/evidence` para recuperá-las.
- **Notificações:** GET aceita `kind`, `unread`, `limit`, `offset`; PATCH de um aviso recebe `is_read`; DELETE o oculta; POST `/notifications/read-all` devolve contagens. Todas as operações ficam limitadas ao destinatário.
- **Chat:** além da API HTTP, o [protocolo WebSocket](README_Chat_Arquitetura.md) descreve autenticação, confirmação, leitura, reconexão e recuperação. Ele não é descrito integralmente pelo OpenAPI HTTP.

`400` indica entrada inválida; `401` falta de autenticação; `403` falta de autorização; `404` recurso não encontrado ou não visível; `409` conflito de estado/agenda; `429` limite; `502/503` falha/indisponibilidade do provedor. Consulte os códigos específicos no catálogo e no schema de cada operação.

## Gerar e validar

No container backend, execute:

```bash
python manage.py spectacular --validate --fail-on-warn --format openapi-json --file coverage-report/openapi.json
python manage.py test common.tests.test_schema --noinput
```

Na raiz do host: `python3 Devops/service_catalog.py`. A CI publica o OpenAPI junto à cobertura e falha se a geração produzir avisos. O teste exige sumário, descrição, grupo e resposta em todas as operações e garante que o webhook esteja incluído. Liveness, readiness e métricas têm contrato próprio no [guia de observabilidade](../Devops/OBSERVABILIDADE.md).
