# Tutorial para o teste de autoria

Exercício: **nova tabela com três registros → seletor no frontend → FK em uma tabela existente → leitura do valor persistido**.

São exemplos para implementar à mão. Nenhuma migration ou mudança de aplicação desta pasta é aplicada automaticamente.

## Ordem de execução

1. [Tabela e três registros](00_tabela_e_tres_registros.md)
2. [API, serializers, services e rotas](01_api_services_e_rotas.md)
3. [Repository, Store, componente e página](02_frontend_repository_store_componente.md)
4. Escolher **um** dos modelos abaixo e aplicar seu guia.
5. [Validar, testar e resolver erros](03_validacao_e_erros.md)

Para alterar diretamente **Minha Conta** e `PATCH /api/users/<id>`, use [Usuários pelo fluxo existente](04_usuarios_pelo_fluxo_existente.md). O arquivo indica cada alteração no serializer, schema Zod, mapper, tipo, payload e componente.

```text
CategoriaSelect -> AutoriaRepository -> /api/autoria/categorias -> categorias_autoria
CategoriaEditor -> PATCH /api/autoria/<recurso>/<id> -> Service -> tabela_existente.categoria_autoria_id
F5              -> GET /api/autoria/<recurso>/<id>   -> JOIN    -> categoria_nome no frontend

Criar: arquivos identificados como completos.
Acrescentar: trechos dentro da classe/lista/função indicada; preservar o código atual.
API base local: http://localhost:8002/api
Frontend local: http://localhost:5175
```

## Modelos

| Modelo real | Tabela | Guia | Quem classifica no exercício |
| --- | --- | --- | --- |
| `users.Users` | `users` | [Usuários](modelos/users.md) | Responsável pelo registro ou administrador |
| `machines.Machines` | `machines` | [Máquinas](modelos/machines.md) | Responsável pelo registro ou administrador |
| `document_validation.Certification` | `certifications` | [Certificações](modelos/certifications.md) | Responsável pelo registro ou administrador |
| `contracts.ContractAmendments` | `contract_amendments` | [Aditivos de contrato](modelos/contract_amendments.md) | Responsável pelo registro ou administrador |
| `contracts.ContractRevisions` | `contract_revisions` | [Revisões de contrato](modelos/contract_revisions.md) | Somente na criação; consulta pelas partes/admin |
| `contracts.ContractSignatureOtps` | `contract_signature_otps` | [Códigos de assinatura](modelos/contract_signature_otps.md) | Administrador |
| `contracts.ContractSignatures` | `contract_signatures` | [Evidências de assinatura](modelos/contract_signatures.md) | Somente na criação; consulta pelas partes/admin |
| `contracts.Contracts` | `contracts` | [Contratos](modelos/contracts.md) | Responsável pelo registro ou administrador |
| `pricing.MachineValuations` | `machine_valuations` | [Pesquisas de valor de máquina](modelos/machine_valuations.md) | Administrador |
| `chat.MessageReports` | `message_reports` | [Denúncias de mensagens](modelos/message_reports.md) | Administrador |
| `chat.Messages` | `messages` | [Mensagens](modelos/messages.md) | Responsável pelo registro ou administrador |
| `notifications.Notification` | `notifications` | [Notificações](modelos/notifications.md) | Responsável pelo registro ou administrador |
| `document_validation.OperatorLicense` | `operator_licenses` | [CNHs de operadores](modelos/operator_licenses.md) | Responsável pelo registro ou administrador |
| `authentication.PasswordResets` | `password_resets` | [Recuperações de senha](modelos/password_resets.md) | Administrador |
| `payments.PaymentEvents` | `payment_events` | [Eventos de pagamento](modelos/payment_events.md) | Administrador |
| `payments.Payments` | `payments` | [Pagamentos](modelos/payments.md) | Administrador |
| `administration.PostingModeration` | `posting_moderations` | [Histórico de moderação](modelos/posting_moderations.md) | Administrador |
| `postings.Postings` | `postings` | [Anúncios](modelos/postings.md) | Responsável pelo registro ou administrador |
| `postings.PostingsPhotos` | `postings_photos` | [Fotos dos anúncios](modelos/postings_photos.md) | Responsável pelo registro ou administrador |
| `pricing.PricingSuggestions` | `pricing_suggestions` | [Sugestões de preço](modelos/pricing_suggestions.md) | Responsável pelo registro ou administrador |
| `payments.RefundAttempts` | `refund_attempts` | [Tentativas de estorno](modelos/refund_attempts.md) | Administrador |
| `payments.Refunds` | `refunds` | [Estornos](modelos/refunds.md) | Administrador |
| `rentals.RentalMeterReadings` | `rental_meter_readings` | [Leituras de horímetro](modelos/rental_meter_readings.md) | Responsável pelo registro ou administrador |
| `api.RentalRecurrence` | `rental_recurrences` | [Recorrências de locação](modelos/rental_recurrences.md) | Responsável pelo registro ou administrador |
| `rentals.Rentals` | `rentals` | [Locações](modelos/rentals.md) | Responsável pelo registro ou administrador |
| `reviews.Reviews` | `reviews` | [Avaliações](modelos/reviews.md) | Responsável pelo registro ou administrador |

## Casos que merecem atenção

```text
Users: categoria não é role. Senhas e promoção para admin não entram no novo PATCH.
PaymentEvents: a PK é string, portanto a URL usa <str:pk>.
ContractRevisions / ContractSignatures: append-only; os guias usam criação, nunca UPDATE.
PasswordResets / OTPs: endpoints do exercício só exibem id e categoria; nunca token/hash/código.
API: RentalRecurrence pertence ao app api, mas sua tabela é rental_recurrences.
Conversas: não há modelo Conversation; a conversa é derivada de Messages e seu escopo.
Operadores: não há modelo Operator; são Users com role=operador e employer.
```

Os 26 guias cobrem os modelos próprios declarados em `BackEnd/*/models.py`. Tabelas internas do Django não fazem parte deste inventário.
