# Avaliação do ensaio — 28/10/2026

> **Arquivado.** O código deste ensaio foi removido da branch de prática e as migrations foram desfeitas no banco `frota_rural_autoria`, também em 28/10/2026. O código continua na branch `codex/autoria-genero-ensaio`. Esta página fica como registro dos erros encontrados.

Branch `codex/autoria-pratica`; banco consultado: `frota_rural_autoria`. Avaliação do exercício atual, sem estimar nota da rubrica.

| Requisito | Evidência | Situação |
| --- | --- | --- |
| Nova tabela e três registros | `Genero`: Masculino, Feminino, Indefinido | Concluído |
| Relacionamento com tabela existente | `users.categoria_autoria_id → Genero.id`; migration `users.0007` aplicada | Estrutura concluída |
| Persistir escolha pelo sistema | Nenhum usuário com FK preenchida; serializer de atualização descarta o campo | Pendente |
| Componente usando a nova tabela | Nenhuma alteração no frontend do ensaio | Pendente |
| Exibir dado persistido após recarregar | Saída de usuários ainda não inclui ID/nome do gênero | Pendente |

## Corrigir primeiro

1. `BackEnd/users/serializer.py:77`: `UserUpdateInputSerializer.Meta.fields = PROFILE_FIELDS` não contém `categoria_autoria`. O serializer aceita o JSON, mas `validated_data` fica vazio quando só esse campo é enviado. Um HTTP 200, sozinho, não comprova gravação.
2. `BackEnd/autoria/serializers.py:14`: `source="Genero"` gera a chave `Genero`; a FK de `Users` se chama `categoria_autoria`. Se mantiver esse serializer auxiliar, trocar para `source="categoria_autoria"`.
3. `BackEnd/autoria/serializers.py:28`: `source="Genero.Genero"` não existe em `Users`. O caminho é `source="categoria_autoria.Genero"`. Com uma categoria atribuída apenas em memória, o serializer atual devolveu `categoria_nome: null`.
4. O catálogo atual devolve `{id, Genero}`. O padrão dos guias novos é `{id, nome}`. Você tem duas saídas:
   - No front, faça o Zod do catálogo ler `{ id, Genero }`.
   - No `CategoriaOutputSerializer`, exponha `nome = serializers.CharField(source="Genero", read_only=True)` e use `fields = ["id", "nome"]`.

## O que está correto

```text
python manage.py check                      → sem problemas
python manage.py makemigrations --check --dry-run → nenhuma mudança pendente
showmigrations autoria users                → todas aplicadas
Genero.objects.count()                      → 3
Users.objects.exclude(categoria_autoria=None).count() → 0
GET /api/autoria/categorias                  → rota registrada
```

`Genero` como nome de campo e tabela é válido, embora `nome`/`generos` sejam mais convencionais. Não é necessário renomear para concluir o ensaio.

`0001`/`0002` referenciam o nome histórico `CategoriaAutoria`; `0003` renomeia para `Genero`. Essa sequência está correta. Não editar migrations já aplicadas para trocar os nomes históricos.

## Continuar daqui

O seu ensaio é o mesmo caso do [guia de usuários](modelos/users.md) (Minha Conta), trocando `PortePropriedade`/`porte_propriedade` por `Genero`/`categoria_autoria`. A diferença é que a sua tabela mora no app `autoria`.

1. **Serializers** (`users/serializer.py`): passo 3 do guia de usuários. `"categoria_autoria"` entra em `UserUpdateInputSerializer.Meta.fields`, e `categoria_nome = serializers.CharField(source="categoria_autoria.Genero", read_only=True, allow_null=True)` + os dois campos entram em `UserOutputSerializer`.
2. **Catálogo:** a rota `GET /api/autoria/categorias` já existe. Siga o passo 8 do guia de usuários apontando para ela.
3. **Front e Minha Conta:** passos 6, 7 e 10 do guia de usuários (Zod, mapper, `AccountSection`).
4. **Comprovar:** [checklist](03_validacao_e_erros.md#checklist-da-defesa): salvar, consultar a FK, recarregar a tela e testar um ID inexistente.

A revisão não alterou seus arquivos de implementação nem gravou dados do exercício.
