# Serviços backend

O [catálogo completo](SERVICOS_BACKEND_CATALOGO.md) descreve cada operação HTTP, seu sumário e respostas. Ele deriva do OpenAPI validado; Swagger e ReDoc estão em `/api/schema/swagger-ui` e `/api/schema/redoc`. As URLs usam o endereço do backend selecionado pelo ambiente, normalmente porta 8000, com prefixo `/api` e sem barra final.

## Executar e abrir o Swagger

Siga os pré-requisitos, configuração de ambiente e inicialização do [README principal](../README.md). Os guias de [pagamentos](../Devops/STRIPE.md) e [observabilidade](../Devops/OBSERVABILIDADE.md) detalham as integrações opcionais. Para desenvolver e testar, use PostgreSQL local descartável, sem apontar a suíte para o banco compartilhado.

Na stack local desta avaliação, abra [Swagger na porta 8002](http://localhost:8002/api/schema/swagger-ui); na stack isolada de qualidade, [porta 8020](http://localhost:8020/api/schema/swagger-ui). A opção **Servers → /** usa o mesmo host e porta da documentação. Não é necessário trocar o schema para cada ambiente.

O início do Swagger contém o roteiro da reserva à assinatura. Para demonstrar: abra uma operação → **Try it out** → preencha os parâmetros e o corpo → **Execute**. **Example Value** traz o preenchimento; **Schema** informa tipos, campos obrigatórios e limites. Confira o código HTTP, o corpo e o header `X-Request-ID` na resposta.

## Contrato de uso

Faça `POST /api/login` com `email` e `password`, envie o `access` em `Authorization: Bearer <token>` e use o cookie HttpOnly de refresh para renovar a sessão. O browser deve enviar credenciais na renovação. A autorização continua sendo aplicada em cada domínio: autenticar não concede acesso a recursos de outras contas.

No Swagger, cole somente o valor de `access` em **Authorize → jwtAuth**, sem o prefixo `Bearer`. Após renovar ou alternar entre locador e locatário, substitua esse token em **Authorize**.

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

## Exemplos executáveis e apresentação

Os UUIDs, datas, nomes e OTPs publicados são **ilustrativos**, não credenciais nem recursos garantidos no banco. Substitua-os por registros do ambiente de teste. Para a reserva, use uma conta locatária, um anúncio e uma máquina ativos de outro usuário, agenda livre e antecedência retornada por `GET /api/rentals/policy`.

1. **Reserva:** o exemplo de `POST /api/rentals` contém anúncio, locatário, três dias e observações. Não envia preço nem status. Para tarifa de R$ 100/h, a API devolve `total_price: "2520.00"`, `billable_days: 3`, `status: "pending"` e `contract_id`.
2. **Pagamento e revisão:** inicie checkout e confirme `approved` no endpoint de pagamento após o webhook. Leia `GET /api/contracts/{id}` e copie `revisao.id`. Um redirecionamento de sucesso não comprova pagamento.
3. **OTP e assinatura:** os exemplos de `/otp` e `/sign` incluem `revision_id`. Use o mesmo UUID nos dois, com o OTP recebido pela parte autenticada. Repita com a outra conta; o resultado final é `signed`. `/evidence` permite conferir as duas assinaturas e a cadeia íntegra.
4. **Alterações:** PATCH de locação exemplifica observações; não permite avançar status. Para a locação paga que ainda não começou, `/amendments` recebe a revisão-base e novas datas com a mesma quantidade de diárias. A aprovação pela outra parte exige novos aceites.
5. **Recorrência:** prévia e criação exemplificam três novas reservas mensais. Repetir a criação com a mesma chave recupera a série, sem duplicá-la.
6. **Horímetro e conclusão:** os exemplos registram retirada de 1.250 h e devolução de 1.274 h, informando 24 h de uso sem mudar o preço. A conclusão exige ambas as assinaturas e o fim do período.

A suíte [test_documented_examples.py](../BackEnd/common/tests/test_documented_examples.py) lê os exemplos **do schema gerado** e os envia à API com usuários, anúncio, máquina e contratos criados no banco de teste. Substitui apenas IDs, datas e OTPs; executa preço, autorização, revisão, validação do código, idempotência e persistência. O envio de e-mail é mockado e o pagamento aprovado é preparado como fixture: esses testes não comprovam entrega de e-mail nem pagamento externo Stripe.

Verificação de 21/10/2026: **21 testes aprovados** entre contrato OpenAPI, exemplos e regressões de horímetro; geração do schema sem avisos. Essa evidência cobre os fluxos descritos acima, não a execução manual de todas as 106 operações. Na apresentação, mostre o teste, o exemplo no Swagger e o resultado; identifique os registros de demonstração como fictícios.

## Painel do locador

`GET /api/dashboard/lessor` devolve os indicadores do painel já agregados no PostgreSQL: série mensal de valores concluídos e avaliações recebidas (rotina `lessor_dashboard_monthly`, meses sem movimento com zero), contagem por status e as cinco máquinas com maior valor concluído. Somente locadores; `machine` precisa ser uma máquina própria.

```bash
curl "$API_URL/dashboard/lessor?months=12&time_zone=America/Sao_Paulo" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`months` aceita 1 a 24 (padrão 6). `time_zone` é um fuso IANA e decide em que mês cai uma devolução perto da meia-noite.

## Gerar e validar

No container backend, execute:

```bash
python manage.py spectacular --validate --fail-on-warn --format openapi-json --file coverage-report/openapi.json
python manage.py test common.tests.test_schema common.tests.test_documented_examples rentals.test_meter --noinput
```

Na raiz do host: `python3 Devops/service_catalog.py`. A CI publica o OpenAPI junto à cobertura e falha se a geração produzir avisos. Os testes exigem sumário, descrição, grupo e resposta em todas as operações, schemas das respostas JSON e execução dos exemplos críticos; garantem ainda que o webhook esteja incluído com resposta vazia. Liveness, readiness e métricas têm contrato próprio no [guia de observabilidade](../Devops/OBSERVABILIDADE.md).
