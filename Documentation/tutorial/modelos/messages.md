# Mensagens — `Messages`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/chat/models.py:45` — dentro de `Messages`, imediatamente antes de `class Meta`, inserir:

```python
categoria_autoria = models.ForeignKey(
    "autoria.Genero", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Terminal em BackEnd/
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural_autoria
python manage.py makemigrations chat
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Concluir o [guia de usuários](../04_usuarios_pelo_fluxo_existente.md). Selecionar uma opção em Minha Conta e salvar antes da operação abaixo. Neste exemplo de ensaio, o registro novo copia o ID selecionado pelo usuário; adaptar o significado da categoria ao enunciado.

## 3 Alteração no service real

`BackEnd/chat/services.py:109` — procurar `def create_message(`

Dentro de `Messages.objects.create`, entre `sender=sender,` e `receiver_id=receiver_id,`, inserir:
```python
categoria_autoria_id=sender.categoria_autoria_id,
```
Essa criação é usada pelo fluxo de envio; manter replay/idempotência por `client_id` e fan-out WebSocket.

## 4 Saída persistida — REST, WebSocket e inbox

`serialize_message` também recebe `InboxMessageRow`, que vem de SQL bruto. Alterar os dois formatos juntos:

1. Em `BackEnd/chat/models.py`, dentro de `Messages`, acrescentar a propriedade:

```python
@property
def categoria_nome(self):
    return self.categoria_autoria.Genero if self.categoria_autoria_id else None
```

2. Em `BackEnd/chat/serializer.py`, no protocolo `MessageLike`, acrescentar propriedades `categoria_autoria_id: UUID | None` e `categoria_nome: str | None` seguindo o formato `@property` existente.
3. No retorno de `serialize_message`, após `"id"`, inserir:

```python
"categoria_autoria": str(message.categoria_autoria_id) if message.categoria_autoria_id else None,
"categoria_nome": message.categoria_nome,
```

4. Em `ChatMessageOutputSerializer`, declarar `categoria_autoria = serializers.UUIDField(allow_null=True)` e `categoria_nome = serializers.CharField(allow_null=True)`.
5. Em `BackEnd/chat/selectors.py`, alterar `_INBOX_SQL`:

```sql
-- No SELECT do CTE mine, depois de m.client_id:
m.categoria_autoria_id, g."Genero" AS categoria_nome,
-- Depois de FROM messages m, antes de WHERE:
LEFT JOIN "Genero" g ON g.id = m.categoria_autoria_id
-- No SELECT final, depois de l.client_id e antes de COUNT(*) OVER ():
l.categoria_autoria_id, l.categoria_nome,
```

6. Acrescentar `categoria_autoria_id: UUID | None` e `categoria_nome: str | None` a `InboxMessageRow`. Na tupla desempacotada de cada linha, inserir esses dois valores entre `client_id` e `_total`; passá-los ao construtor de `InboxMessageRow`.
7. O índice de `total_threads` muda de 15 para 17: substituir `total = int(rows[0][15])` por `total = int(rows[0][17])`.

Preservar as colunas de agrupamento e a ordenação do inbox. Testar mensagem nova, histórico REST, recebimento WebSocket e lista de conversas; uma delas pode quebrar se só o model for alterado.

## 5 Frontend e comprovação

Ampliar schema de mensagem em `features/chat/types/chatSchemas.ts`, tipo em `chat.ts` e leitura em `api/chatMapper.ts`. Em `components/MessageBubble.tsx`, exibir `message.categoriaNome`. Salvar o perfil, enviar uma mensagem nova, verificar nos dois participantes e recarregar o histórico. Não alterar mensagens antigas.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
