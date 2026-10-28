# Histórico de moderação — `PostingModeration`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/administration/models.py:32` — dentro de `PostingModeration`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations administration
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Concluir o [guia de usuários](../04_usuarios_pelo_fluxo_existente.md). Selecionar uma opção em Minha Conta e salvar antes da operação abaixo. Neste exemplo de ensaio, o registro novo copia o ID selecionado pelo usuário; adaptar o significado da categoria ao enunciado.

## 3 Alteração no service real

`BackEnd/administration/services.py:100` — procurar `class PostingModerationService`

Nos DOIS `PostingModeration.objects.create` (`approve` e `reject`), depois de `moderator=moderator`, acrescentar:
```python
categoria_autoria_id=moderator.categoria_autoria_id if moderator else None,
```
Preservar status, motivo e papel administrativo. Cada decisão gera um novo registro; não editar decisões anteriores.

## 4 Saída persistida

Não há endpoint de consulta pública deste registro. Para o ensaio, acrescentar uma leitura mínima ao perfil autenticado já existente.

`BackEnd/users/serializer.py` → `UserOutputSerializer`, antes de `class Meta`:

```python
ultimo_registro_autoria = serializers.SerializerMethodField()

def get_ultimo_registro_autoria(self, obj):
    from administration.models import PostingModeration
    registro = (PostingModeration.objects.filter(moderator=obj)
                .select_related("categoria_autoria").order_by("-created_at").first())
    if registro is None:
        return None
    return {"id": str(registro.pk),
            "categoria_nome": registro.categoria_autoria.Genero if registro.categoria_autoria_id else None}
```
Acrescentar `"ultimo_registro_autoria"` a `UserOutputSerializer.Meta.fields`. Usar somente um modelo neste exemplo; se combinar vários, dar um nome distinto a cada projeção. Manter o acesso ao próprio perfil/admin em `UserService.get`.

## 5 Frontend e comprovação

Em `userApiSchema`, acrescentar `ultimo_registro_autoria: z.object({ id: z.string(), categoria_nome: z.string().nullable() }).nullish()`. Em `User`, acrescentar `ultimoRegistroAutoria?: { id: string; categoria_nome: string | null } | null`; em `userMapper.toDomain`, copiar `ultimoRegistroAutoria: dto.ultimo_registro_autoria ?? null`.

Em `AccountSection`, abaixo do texto do gênero salvo, exibir `<p>Último registro: {user?.ultimoRegistroAutoria?.categoria_nome ?? "Nenhum"}</p>`. Executar a operação do modelo e recarregar Minha Conta. O texto vem do registro alvo persistido, não da seleção atual do perfil. Salvar a seleção no perfil admin, aprovar/rejeitar um anúncio de teste e recarregar o perfil do mesmo administrador.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
