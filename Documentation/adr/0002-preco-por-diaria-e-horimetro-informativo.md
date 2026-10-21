# ADR 0002: Preço por diária e horímetro informativo

**Status:** Aceito
**Data:** 2026-10-21

## Contexto

O requisito T03 previa cobrar horas excedentes a partir das leituras de horímetro:
franquia de horas incluídas, cálculo do excedente, aprovação ou contestação pelas
partes e uma cobrança complementar. A auditoria
[FEATURE_AUDIT_T01_T07.md](../FEATURE_AUDIT_T01_T07.md) encontrou apenas os dois
campos inteiros de leitura, aceitando valores negativos e decrescentes, e um
contrato que prometia esse acerto (cláusula 4.3, pagamento da diferença direto ao
Locador) sem que a plataforma o executasse.

A auditoria também mostrou que o valor de uma locação paga podia ser recalculado
a partir da tarifa atual do anúncio: um PATCH com o mesmo `postings` levava uma
locação paga de R$ 3.024,00 para R$ 5.040,00 sem alterar o pagamento aprovado.

## Decisão

- O preço da locação é uma **diária fixa**: `diária = tarifa/hora × 8`,
  `subtotal = diária × diárias` (dias de início e fim contam inteiros) e
  `total = subtotal × 1,05` (taxa da plataforma). É a regra que já existia em
  `payments/pricing.py`.
- O preço é **congelado na reserva**. A locação guarda a cotação (tarifa, diária,
  diárias, subtotal, taxa e total). Mudanças posteriores na tarifa do anúncio não
  alteram reservas existentes. Uma nova cotação só acontece quando o locatário
  altera as datas de uma reserva ainda não paga, ou no checkout de uma reserva não
  paga cuja retenção de 30 minutos já expirou.
- As leituras de horímetro da locação são **apenas métricas de uso**. Não alteram
  o valor, não geram cobrança nem estorno e não são exigidas para concluir a
  locação. Leituras inválidas (negativas, acima de 60.000 h ou com a final menor
  que a inicial) são recusadas.
- Concluir uma locação exige o contrato assinado pelas duas partes e a data de fim
  alcançada.
- O T03 deixa de ser uma funcionalidade de cobrança. Saem do escopo: franquia de
  horas, fórmula de excedente, contestação de horas, checkout complementar e a
  notificação de excedente.

## Consequências

- `Rentals` ganha colunas de cotação. A migração preenche as locações existentes a
  partir do valor acordado: o do pagamento aprovado, quando houver, ou
  `total_price`. Se um pagamento aprovado divergir de `total_price` (o defeito da
  auditoria), o pagamento prevalece e `total_price` é corrigido.
- O texto do contrato precisa deixar de prometer cobrança por hora excedente. Isso
  é feito junto das revisões imutáveis do contrato (passos 1.2 e 1.5 do
  [plano de implementação](../IMPLEMENTATION_PLAN_T01_T07.md)).
- A sugestão de preço para o locador (`BackEnd/pricing/`) continua usando o
  horímetro acumulado da máquina como indicador de desgaste. Ela só propõe uma
  tarifa; não define o valor de nenhuma locação.
- Se o T03 for um item avaliado na especificação do projeto, a troca de escopo
  precisa ser confirmada com quem aceita o projeto.
