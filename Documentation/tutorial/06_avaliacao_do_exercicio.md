# Avaliação do ensaio — 28/10/2026

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
4. O catálogo atual devolve `{id, Genero}`; o componente antigo esperava `{id, nome}`. O guia 01 normaliza a saída para `nome`.

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

1. [Guia 01](01_api_services_e_rotas.md): ajustar somente a saída do catálogo.
2. [Guia 02](02_frontend_repository_store_componente.md): criar seletor compartilhado.
3. [Guia 04](04_usuarios_pelo_fluxo_existente.md): ligar ao `UserService.update`, `UserRepository.updateProfile` e `AccountSection` existentes.
4. [Guia 03](03_validacao_e_erros.md): salvar, consultar a FK, recarregar a tela e testar ID inexistente/permissões.

A revisão não alterou seus arquivos de implementação nem gravou dados do exercício.
