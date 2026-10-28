# Tutorial da defesa — alteração individual

Na defesa, cada integrante recebe um pedido diferente, sempre com esta estrutura:

| O professor pede | O que isso vira no código | Passos da receita |
| --- | --- | --- |
| **Banco:** criar uma tabela nova e inserir 3 registros | `class NovaTabela(models.Model)` + migration de dados | 1 e 3 |
| **Persistência e relacionamento:** gravar numa tabela existente o ID de um registro da tabela nova | FK `models.ForeignKey(NovaTabela, ...)` no model existente + o campo no serializer de entrada | 2 e 4 |
| **Front-end:** um componente que use os registros da tabela nova | `GET` do catálogo + `<select>` no formulário da tela | 5, 6, 9 e 10 |
| **Exibição:** mostrar um dado persistido | campo `<fk>_nome` no serializer de saída → Zod → mapper → tela, comprovado com F5 | 4, 7, 8 e 11 |

> Exemplo: "Em máquina, adicione um dropdown com 3 tipos de pneu". Você cria a tabela `tipos_pneu`, insere Radial/Diagonal/Alta flutuação, cria `machines.tipo_pneu_id`, põe o select no cadastro de máquina e mostra "Pneu: Radial" na frota.

## Como usar no dia

1. **Ache a tela** do pedido na tabela abaixo e abra o guia dela.
2. **Troque os nomes** do exemplo pelos do pedido, com a [tabela de nomes](01_receita_geral.md#2-escolher-os-nomes). Ex.: `TipoPneu` → `Combustivel`, `tipos_pneu` → `combustiveis`, `tipo_pneu` → `combustivel`.
3. **Siga os passos na ordem:** backend → migrations → teste no Swagger → frontend → F5.
4. **Comprove** com o [checklist](03_validacao_e_erros.md#checklist-da-defesa): SQL das 3 linhas, SQL da FK, tela depois do F5.

Se travar, veja os [erros comuns](03_validacao_e_erros.md#erros-comuns).

## Guias por tela

Cada guia traz um pedido de exemplo **já aplicado e testado** numa cópia limpa do código (migrations, API, tela com F5 e testes unitários). Ele mostra o arquivo, a linha, o código para colar e os testes que precisam de ajuste.

| Tela do sistema | Rota | Model | Guia | Exemplo do guia |
| --- | --- | --- | --- | --- |
| Cadastro de máquina / Minha frota / Editar máquina | `/dashboard/novo-equipamento`, `/dashboard?tab=frota` | `Machines` | **[Exemplo completo](02_exemplo_maquina_tipo_pneu.md)** | Tipo de pneu |
| Novo anúncio / Gerenciar anúncio / Página do anúncio | `/dashboard/novo-anuncio`, `/dashboard/gerenciar-anuncio/<id>`, `/anuncio/<id>` | `Postings` | [postings.md](modelos/postings.md) | Modalidade de entrega |
| Reserva de máquina / card da locação | `/reservar/<id>`, aba Locações | `Rentals` | [rentals.md](modelos/rentals.md) | Tipo de cultura |
| Cadastro de conta / Minha Conta | `/signup`, aba Minha Conta | `Users` | [users.md](modelos/users.md) | Porte da propriedade |
| Cadastro de operador | `/dashboard?tab=operadores` | `Users` (papel operador) | [operators.md](modelos/operators.md) | Função do operador |
| Avaliação de locação | card de locação concluída, aba Avaliações | `Reviews` | [reviews.md](modelos/reviews.md) | Critério da avaliação |
| Envio de CNH | `/document/cnh`, aba Documentos | `OperatorLicense` | [operator_licenses.md](modelos/operator_licenses.md) | Tipo de vínculo |
| Envio de certificação | `/document/certification`, aba Documentos | `Certification` | [certifications.md](modelos/certifications.md) | Área da certificação |

**Comece pelo [exemplo completo](02_exemplo_maquina_tipo_pneu.md).** Ele explica o porquê de cada passo; os outros guias só apontam onde mudar.

### Modelos sem tela de cadastro própria

Estes registros são criados pelo sistema (pagamento, assinatura, chat, moderação), e não por um formulário. É improvável que caiam na defesa. Se cair, aplique a [receita](01_receita_geral.md):

1. **Origem do ID:** um select numa tela que já existe. Por exemplo, o perfil em Minha Conta, como no [guia de usuários](modelos/users.md).
2. **Gravação:** passe o ID no ponto de criação abaixo.
3. **Exibição:** o OutputSerializer dessa entidade.

| Model | Onde o registro nasce |
| --- | --- |
| `Contracts` | `BackEnd/contracts/services.py:73` → `create_for_rental` |
| `ContractSignatureOtps` | `BackEnd/contracts/services.py:221` → `request_otp` |
| `ContractSignatures`, `ContractRevisions`, `ContractAmendments` | `BackEnd/contracts/models.py` (linhas 114, 54, 201) + services de `contracts` |
| `Messages` | `BackEnd/chat/services.py:109` → `create_message` (tela `/mensagens`) |
| `MessageReports` | `BackEnd/chat/services.py:434` → `report_message` (denúncia no chat) |
| `Payments` / `PaymentEvents` | `BackEnd/payments/services.py:172` → `_new_attempt` / `:297` → `handle_webhook` |
| `Refunds` / `RefundAttempts` | `BackEnd/payments/models.py` (linhas 67 e 83) + cancelamento em `rentals/cancellation.py` |
| `PostingsPhotos` | `BackEnd/postings/services.py:174` → `_save_photo` |
| `PostingModeration` | `BackEnd/administration/services.py:100` → `PostingModerationService` |
| `PricingSuggestions` / `MachineValuations` | `BackEnd/pricing/models.py` (linhas 74 e 27) + `pricing/services.py` |
| `Notification` | `BackEnd/notifications/models.py:25` + `notifications/services.py` |
| `PasswordResets` | `BackEnd/authentication/services.py:78` → `request_reset` |
| `RentalMeterReadings` | `BackEnd/rentals/models.py:83` + `rentals/meter.py` |
| `RentalRecurrence` | `BackEnd/api/models.py:24` + `api/recurrence_views.py` |

## Arquivos desta pasta

| Arquivo | Para que serve |
| --- | --- |
| [01_receita_geral.md](01_receita_geral.md) | A receita de 11 passos com nomes genéricos, para qualquer tela |
| [02_exemplo_maquina_tipo_pneu.md](02_exemplo_maquina_tipo_pneu.md) | Exemplo completo, linha a linha |
| [03_validacao_e_erros.md](03_validacao_e_erros.md) | Como comprovar cada requisito, erros comuns e testes |
| [05_ambiente_dev_e_banco_isolado.md](05_ambiente_dev_e_banco_isolado.md) | Banco isolado e Django nativo para ensaiar |
| [06_avaliacao_do_exercicio.md](06_avaliacao_do_exercicio.md) | Avaliação do seu ensaio (`autoria.Genero` em `Users`) |
| [modelos/](modelos/) | Um guia por tela de cadastro |

## Sobre as linhas

- Os números se referem ao código **original** do commit `0ca8c7e` (branch `develop_joaofre_locacoes_integradas`, PR para `develop`).
- Cada passo diz "depois da linha N" **e** mostra o texto daquela linha (a âncora). Se você já colou algo antes no mesmo arquivo, os números andam; procure a âncora com `Ctrl+F`.
- "Trocar a linha N por" significa substituir a linha inteira. "Colar" significa inserir sem apagar nada.
- Na sua cópia local, `BackEnd/users/models.py`, `djangoapi/settings.py` e `djangoapi/urls.py` têm as alterações do ensaio (app `autoria`). Nesses arquivos, os números locais são diferentes.

## Ambiente

```bash
# Docker (stack padrão do projeto)
docker compose exec backend python manage.py makemigrations <app>
docker compose exec backend python manage.py migrate

# Django nativo com o banco isolado do ensaio (guia 05)
cd BackEnd && source .venv/bin/activate && source ../Devops/autoria.env.sh
python manage.py verify_database   # esperado: 127.0.0.1:5442 / frota_rural_autoria
```

- Swagger: `/api/schema/swagger-ui` → confira o endpoint novo antes de ir para o front.
- Frontend: `npx tsc -b` e `npx vitest run <pastas>` dentro de `FrontEnd/` (ver [03](03_validacao_e_erros.md#testes-automatizados)).
