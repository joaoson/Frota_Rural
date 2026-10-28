# Notificações — `Notification`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/notifications/models.py:25` — dentro de `Notification`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations notifications
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Concluir o [guia de usuários](../04_usuarios_pelo_fluxo_existente.md). Selecionar uma opção em Minha Conta e salvar antes da operação abaixo. Neste exemplo de ensaio, o registro novo copia o ID selecionado pelo usuário; adaptar o significado da categoria ao enunciado.

## 3 Alteração no service real

`BackEnd/notifications/events.py:38` — procurar `def notify_rental_event(`

O service real é a função `notify_rental_event`; não há `NotificationService`. Dentro de `defaults` de `Notification.objects.get_or_create`, acrescentar:
```python
"categoria_autoria_id": rental.lessee.categoria_autoria_id,
```
O exemplo copia a seleção do locatário quando o evento nasce. Preservar a deduplicação `(recipient_id, event_key)`.

## 4 Saída persistida

`BackEnd/notifications/serializers.py:6` — procurar `class NotificationSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `NotificationSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```


## 5 Frontend e comprovação

Em `features/notifications/types/notification.ts`, ampliar schema/tipo; em `NotificationRepository.ts`, ampliar o objeto de leitura se houver mapeamento explícito. Exibir o nome em `features/notifications/components/NotificationList.tsx`. Criar uma reserva para gerar notificações, abrir o painel e recarregar. O PATCH existente só marca leitura e não deve aceitar categoria.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
