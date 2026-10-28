# Tutorial do teste de autoria

**Nova tabela + três registros → componente → FK em tabela existente → dado persistido exibido após F5.**

Base: branch `codex/autoria-pratica`, código revisado em 28/10/2026. Seu ensaio utiliza `autoria.Genero` e `Users.categoria_autoria`. Os exemplos continuam com esses nomes; adaptar o domínio ao enunciado recebido.

## Continuar seu exercício

1. [Avaliação do que você já implementou](06_avaliacao_do_exercicio.md).
2. [Ajustar a saída do catálogo existente](01_api_services_e_rotas.md).
3. [Criar hook e seletor compartilhados](02_frontend_repository_store_componente.md).
4. [Usuários: alterações exatas no fluxo existente](04_usuarios_pelo_fluxo_existente.md).
5. [Validar API, banco e tela](03_validacao_e_erros.md).

Você já criou a tabela, os três registros e a FK. O [guia 00](00_tabela_e_tres_registros.md) serve para conferir isso ou criar outra tabela durante a defesa.

```text
CategoriaSelect → GET /api/autoria/categorias → CategoriaAutoriaService.listar
Minha Conta → useUpdateProfile → UserStore → UserRepository.updateProfile
PATCH /api/users/<id> → UserDetailView → UserService.update
UserUpdateInputSerializer.save() → users.categoria_autoria_id
GET /api/users/<id> → UserOutputSerializer → Zod → mapper → tela
```

## Ambiente


```bash
# Terminal em BackEnd/
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural_autoria
```

- Frontend: [localhost:5183](http://localhost:5183).
- Swagger: [localhost:8010/api/schema/swagger-ui](http://localhost:8010/api/schema/swagger-ui).
- Banco: `frota_rural_autoria`, host `127.0.0.1`, porta `5442`.
- [Reiniciar Django nativo e frontend](05_ambiente_dev_e_banco_isolado.md).

## Como ler os guias

```text
Arquivo:linha → posição do código revisado; usar o nome da classe/método como âncora.
“Inserir entre…” → adicionar só o trecho indicado, preservando o restante.
“Referência, não substituir” → código atual mostrado para explicar o caminho.
Arquivo novo completo → copiar o bloco inteiro para o caminho indicado.
```

Os 26 guias apontam para os services e componentes reais. Usuários tem o exemplo completo de inserção linha a linha. Os demais são roteiros de adaptação ao modelo escolhido, com o ponto de gravação e as projeções de leitura que precisam receber o campo.

Nos modelos internos, o guia identifica se a FK vem do formulário próprio ou de uma seleção já salva no perfil. Para esses casos, o significado da classificação deve seguir o enunciado. Pagamentos, envio de e-mail, upload e pesquisa externa podem exigir configuração do provedor ou mocks nos testes; o ambiente isolado mantém essas credenciais vazias.

O código desta pasta é material para implementar à mão. Atualizar os guias não aplica a solução à aplicação nem às tabelas do ensaio.

## Modelos

| Guia do modelo atual |
| --- |
| [Certificações — `Certification`](modelos/certifications.md) |
| [Aditivos — `ContractAmendments`](modelos/contract_amendments.md) |
| [Revisões de contrato — `ContractRevisions`](modelos/contract_revisions.md) |
| [Códigos de assinatura — `ContractSignatureOtps`](modelos/contract_signature_otps.md) |
| [Assinaturas — `ContractSignatures`](modelos/contract_signatures.md) |
| [Contratos — `Contracts`](modelos/contracts.md) |
| [Pesquisas de valor — `MachineValuations`](modelos/machine_valuations.md) |
| [Máquinas — `Machines`](modelos/machines.md) |
| [Denúncias de mensagens — `MessageReports`](modelos/message_reports.md) |
| [Mensagens — `Messages`](modelos/messages.md) |
| [Notificações — `Notification`](modelos/notifications.md) |
| [CNHs — `OperatorLicense`](modelos/operator_licenses.md) |
| [Recuperações de senha — `PasswordResets`](modelos/password_resets.md) |
| [Eventos de pagamento — `PaymentEvents`](modelos/payment_events.md) |
| [Pagamentos — `Payments`](modelos/payments.md) |
| [Histórico de moderação — `PostingModeration`](modelos/posting_moderations.md) |
| [Anúncios — `Postings`](modelos/postings.md) |
| [Fotos de anúncios — `PostingsPhotos`](modelos/postings_photos.md) |
| [Sugestões de preço — `PricingSuggestions`](modelos/pricing_suggestions.md) |
| [Tentativas de estorno — `RefundAttempts`](modelos/refund_attempts.md) |
| [Estornos — `Refunds`](modelos/refunds.md) |
| [Leituras de horímetro — `RentalMeterReadings`](modelos/rental_meter_readings.md) |
| [Recorrências — `RentalRecurrence`](modelos/rental_recurrences.md) |
| [Locações — `Rentals`](modelos/rentals.md) |
| [Avaliações — `Reviews`](modelos/reviews.md) |
| [Users — perfil existente](modelos/users.md) |

Operadores são `Users` com outro papel e empregador. Conversas são derivadas de `Messages`; não há model `Conversation`. Tabelas internas do Django não fazem parte dos 26 modelos de negócio listados.

## Validação desta revisão

O exemplo de usuários dos guias 01/02/04 foi aplicado em cópia temporária: 7 testes de backend passaram (incluindo FK, GET, UUID inválido e autorização), 3 testes de frontend passaram (salvar/reabrir, falha de catálogo e falha de gravação), além de TypeScript e lint dos arquivos alterados. O banco de testes foi removido ao terminar. Os outros 25 guias tiveram seus caminhos e pontos de integração revisados; suas adaptações não foram executadas como funcionalidades completas.

Sua implementação e o banco `frota_rural_autoria` foram preservados para a prática.
