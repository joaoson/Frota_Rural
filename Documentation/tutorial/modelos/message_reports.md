# Denúncias de mensagens — `MessageReports`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/chat/models.py:113` — dentro de `MessageReports`, imediatamente antes de `class Meta`, inserir:

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

`BackEnd/chat/services.py:434` — procurar `def report_message(`

Dentro de `MessageReports.objects.create`, depois de `reported_by=user`, inserir:
```python
categoria_autoria_id=user.categoria_autoria_id,
```
Manter a validação de participação, a proibição de denunciar a própria mensagem e a unicidade de denúncia.

## 4 Saída persistida

Em `BackEnd/administration/services.py`, `ChatModerationService._queue_item`, dentro do dicionário de cada `report` em `"reports"`, depois de `"id": str(report.id)`, inserir:
```python
"categoria_autoria": str(report.categoria_autoria_id) if report.categoria_autoria_id else None,
"categoria_nome": report.categoria_autoria.Genero if report.categoria_autoria_id else None,
```
Em `administration/serializer.py`, `ModerationReportOutputSerializer`, declarar UUID nullable e CharField nullable. Acrescentar `"categoria_autoria"` ao `select_related` de reports.

## 5 Frontend e comprovação

Em `features/administration/types/moderationSchemas.ts`, ampliar o schema de cada denúncia; propagar no tipo/mapper se houver. Na tela administrativa que renderiza `reports`, exibir o campo de cada denúncia. A gravação continua em `ReportMessageDialog` → `ChatRepository` → `ThreadService.report_message`; a leitura é administrativa. Denunciar mensagem de outro participante e conferir com a conta admin.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
