# Comprovar, depurar e testar

## Checklist da defesa

Faça na ordem. Cada item comprova um requisito do enunciado.

| ✔ | Requisito | Como mostrar |
| --- | --- | --- |
| ☐ | Tabela nova + 3 registros | `SELECT id, nome FROM <tabela_nova>;` → 3 linhas |
| ☐ | Componente usa a tabela | Abrir a tela: o select lista as 3 opções. No DevTools, aba Network, aparece o `GET` do catálogo |
| ☐ | Persistência com o ID | Salvar pela tela e rodar o `SELECT ... JOIN` abaixo. A coluna `<fk>_id` tem o UUID do registro escolhido |
| ☐ | Exibição do dado persistido | F5 na tela de leitura → o **nome** aparece. Na edição, o select vem preenchido |
| ☐ | Explicar o caminho | Tela → mapper → Repository → InputSerializer → service → `serializer.save()` → banco → OutputSerializer → Zod → tela |

```sql
-- Troque os nomes pelos do seu pedido
SELECT e.id, e.<fk>_id, n.nome
FROM <tabela_existente> e
LEFT JOIN <tabela_nova> n ON n.id = e.<fk>_id
ORDER BY e.created_at DESC
LIMIT 5;
```

Mostre também o erro de um ID inexistente, que comprova a validação da FK:

```text
PATCH /api/<recurso>/<id>   {"<fk>": "00000000-0000-4000-8000-000000000999"}
→ 400 {"errors": {"<fk>": ["Pk inválido \"…\" - objeto não existe."]}}
```

## Comandos de conferência

```bash
# BackEnd/
python manage.py check                              # sem erros
python manage.py makemigrations --check --dry-run   # "No changes detected"
python manage.py showmigrations <app>               # as duas novas com [X]
python manage.py spectacular --validate --fail-on-warn --file /tmp/schema.json   # o CI roda isto

# FrontEnd/
npx tsc -b                                          # sem saída = sem erro de tipo
npx eslint <arquivos mexidos>
npx vitest run <pastas mexidas>                     # os guias dizem quais
```

## Erros comuns

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| `makemigrations` responde "No changes detected" | O model não foi salvo no arquivo certo, ou o app está errado no comando | Confira o `models.py` e rode `makemigrations <app>` |
| `NodeNotFoundError` / dependência inexistente no `migrate` | O nome em `dependencies` da migration de dados não bate com o arquivo gerado | Copie o nome exato do arquivo, sem `.py` |
| Tabela criada, mas vazia | A migration de dados ficou com `operations = []` | Preencha o `RunPython(inserir, remover)` e rode `migrate` |
| `Pk inválido ... objeto não existe` | O ID enviado não existe na tabela nova | Use o `id` que o `GET` do catálogo devolve (é o `value` da `<option>`) |
| Salva com 200, mas a FK fica `NULL` | O campo não está no `Meta.fields` do **InputSerializer usado pelo service** | Acrescente-o. Em Users, por exemplo, cadastro e perfil usam serializers diferentes |
| O nome não aparece na tela, mas está no banco | Falta o campo no **OutputSerializer**, no **Zod** ou no **mapper** | O Zod descarta chaves que não conhece. Confira os três |
| `"<fk>_nome"` some da resposta quando é nulo | Faltou `allow_null=True` no `CharField(source=...)` | Use `read_only=True, allow_null=True` |
| Select vazio na tela | URL errada, `401` (catálogo exige login) ou erro no `parse` | No Network, veja o status. No Signup, a view precisa de `AllowAny` |
| Select não mostra o valor salvo ao editar | O estado inicial do formulário não recebe `<campo>Id` | Preencha no `reset(...)`, no `operatorToForm` ou no sync de Minha Conta |
| `tsc`: `Property 'x' is missing in type ...` | Um teste monta o objeto à mão | Acrescente o campo no fixture do teste, como os guias indicam |
| Teste: `No QueryClient set` | A tela ganhou um `useQuery` e o teste renderiza sem React Query | `vi.mock("<caminho do hook novo>", () => ({ useX: () => ({ data: [], isLoading: false }) }))` |
| Teste: `No "xStore" export is defined on the "@/app/container" mock` | O teste mocka o container inteiro | Mocke o hook novo (linha acima) ou acrescente o store ao mock |
| Teste: `expected ... not to be called` / body diferente | A tela agora faz um `GET` ao abrir, e o payload tem a chave nova | Responda o `GET` no `serve(...)` e acrescente `<fk>: null` ao body esperado |

## Testes automatizados

Os guias listam os testes que quebram e a correção exata. A regra geral:

1. **Tipos primeiro:** rode `npx tsc -b`. Cada erro aponta um fixture de teste ao qual falta o campo novo.
2. **Testes da pasta:** rode `npx vitest run src/features/<feature> src/pages/<pasta-da-tela>`.
3. **Três motivos de quebra**, sempre os mesmos:
   - O teste compara o body exato de um POST/PATCH → acrescente `<fk>: null`.
   - O teste espera "nenhuma chamada HTTP" → agora existe o GET do catálogo.
   - O teste mocka hooks ou o container → mocke também o hook ou o método novo.
4. **Backend (opcional na defesa):** `python manage.py test <app>`. Os testes existentes continuam passando, porque a FK é opcional (`null=True`).

Resultado nos exemplos verificados, depois dos ajustes:

| Exemplo | Testes rodados | Resultado |
| --- | --- | --- |
| Máquina / tipo de pneu | machines, pages/machines, pages/dashboard | 89 passaram |
| Anúncio / modalidade de entrega | postings, pages/postings, pages/public | 88 passaram |
| Locação / tipo de cultura | contracts, dashboard, pages/postings, pages/dashboard, payments | 215 passaram |
| Usuário / porte da propriedade | users, dashboard, pages/auth, pages/dashboard | 148 passaram |
| Operador / função | components, operators, dashboard, users, pages | 333 passaram |
| Avaliação / critério | reviews, dashboard, pages/dashboard, pages/postings | 146 passaram |
| Certificação / área | documents, pages/documents, dashboards | 189 passaram |
| CNH / tipo de vínculo | documents, pages/documents, dashboards, admin | 219 passaram |
| **Os 8 exemplos juntos** | suíte inteira do frontend (`npx vitest run`) + `tsc -b` + `eslint src` | **769 passaram**, sem erro de tipo nem de lint |
| **Os 8 exemplos juntos (backend)** | `check`, `makemigrations --check`, `spectacular --validate --fail-on-warn`, `test machines postings rentals users reviews document_validation` | sem problemas; 209 testes OK (4 ignorados) |
