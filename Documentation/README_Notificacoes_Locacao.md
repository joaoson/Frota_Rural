# T05 — Receber Notificações Sobre a Locação

O locatário e o locador recebem notificações persistentes dentro da plataforma
sobre suas reservas, pagamentos e contratos. O sino e a central de notificações
usam os mesmos dados do servidor; os avisos fictícios dos dashboards foram
substituídos.

## Eventos

| Categoria | Alterações notificadas |
| --- | --- |
| Locação | Nova reserva avulsa ou recorrente, alteração dos dados, cancelamento e conclusão |
| Pagamento | Checkout iniciado, confirmação, expiração/falha e necessidade de análise |
| Contrato | Assinatura de cada parte e conclusão das duas assinaturas |

Cada aviso identifica a máquina e a reserva. Somente o locatário e o proprietário
da máquina recebem o evento. Uma pessoa que exerça os dois papéis recebe apenas
um aviso por evento. Operadores e outros usuários não recebem dados dessas
locações.

Os eventos são gravados na mesma transação da alteração correspondente. Falhas
que desfazem uma reserva também desfazem seus avisos. A combinação de destinatário
e chave do evento impede duplicatas ao repetir webhooks, checkout ou criação
idempotente de recorrência. Repetir uma atualização sem mudar os dados não gera
um novo aviso.

## Uso

- O sino mostra a quantidade de avisos não lidos e abre os avisos recentes.
- A central permite filtrar por categoria e leitura, consultar outras páginas,
  marcar como lido/não lido, marcar todos como lidos e excluir avisos.
- Abrir o assunto leva à locação ou ao documento do contrato correspondente.
- A lista consulta novas informações a cada 30 segundos enquanto a página está
  visível e ao voltar o foco à janela. Não depende de permissões do navegador.
- A leitura e a exclusão ficam salvas no servidor e são independentes para cada
  destinatário. Excluir um aviso não altera a locação, o pagamento ou o contrato.

Ao trocar filtros, sair da página ou desmontar um componente, requisições antigas
podem ser canceladas. O cliente HTTP distingue esse cancelamento de falhas de
conexão: não registra erro nem tenta novamente uma requisição cancelada. A nova
consulta continua normalmente. Falhas reais de rede mantêm a mensagem de erro e
a possibilidade de tentar novamente.

Esta entrega usa notificações internas. Não envia e-mail, SMS ou push do sistema
operacional. A passagem do prazo provisório de uma reserva, sozinha, não executa
um agendador: avisos de pagamento vencido acompanham os eventos de pagamento
processados pelo backend.

## API

Todos os endpoints exigem autenticação e consultam somente o destinatário atual.
Um identificador pertencente a outra pessoa retorna `404`.

| Método e caminho | Resultado |
| --- | --- |
| `GET /api/notifications/` | Página de avisos e total global não lido |
| `PATCH /api/notifications/{id}` | Altera leitura com `{"is_read": true}` ou `false` |
| `DELETE /api/notifications/{id}` | Exclui o aviso da caixa do destinatário |
| `POST /api/notifications/read-all` | Marca os avisos atuais como lidos |

A listagem aceita `limit` (1–100), `offset`, `kind` (`rental`, `payment`,
`contract`) e `unread` (`true` ou `false`). Retorna `results`, `count` (total do
filtro) e `unread_count` (total não lido da caixa). Não é possível escolher outro
destinatário pelo corpo ou pelos parâmetros da requisição.

A exclusão é lógica: `dismissed_at` retira o aviso da caixa, preservando sua chave
de deduplicação. Um webhook repetido não faz reaparecer um aviso excluído.

## Banco e validação

A migration `notifications.0001_initial` cria a tabela `notifications` com índices
para destinatário, leitura e exclusão. Ela segue o schema PostgreSQL configurado;
no Supabase, as tabelas da aplicação ficam no schema privado `frota_rural`.

As suítes automatizadas usam PostgreSQL local e fixtures próprias. O ambiente
Supabase recebe somente as migrations e os dados de demonstração autorizados.
Os resultados finais ficam no [relatório de integração](README_Merge_Readiness.md).
