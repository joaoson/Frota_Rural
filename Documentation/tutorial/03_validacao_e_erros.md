# Validar o fluxo real

## 1 Ambiente e migrations


```bash
# Terminal em BackEnd/
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural_autoria
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py showmigrations autoria users
```

## 2 API — exemplo completo de usuários

No terminal de `BackEnd/`, com o ambiente do passo 1:

```bash
LOGIN=$(curl --fail-with-body -sS "$AUTORIA_API/login"   -H 'Content-Type: application/json'   -d '{"email":"joao.silva@example.test","password":"Teste1234"}')
TOKEN=$(printf '%s' "$LOGIN" | python -c 'import json,sys; print(json.load(sys.stdin)["access"])')
USER_ID=$(python manage.py shell -c 'from users.models import Users; print(Users.objects.get(email="joao.silva@example.test").pk)' | tail -n 1)

curl --fail-with-body -sS "$AUTORIA_API/autoria/categorias" -H "Authorization: Bearer $TOKEN"

curl --fail-with-body -sS -X PATCH "$AUTORIA_API/users/$USER_ID"   -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json'   -d '{"categoria_autoria":"11111111-1111-4111-8111-111111111111"}'

curl --fail-with-body -sS "$AUTORIA_API/users/$USER_ID" -H "Authorization: Bearer $TOKEN"
```

Esperado: `categoria_autoria` igual ao UUID enviado e `categoria_nome: "Masculino"` tanto no PATCH como no GET. Login do seed: `Teste1234`; `Senha1234` não é a senha dessas contas.

## 3 Banco — comprovar persistência

```bash
python manage.py shell -c 'from users.models import Users; u=Users.objects.select_related("categoria_autoria").get(email="joao.silva@example.test"); print(u.categoria_autoria_id, u.categoria_autoria.Genero if u.categoria_autoria else None)'
```

```sql
-- DBeaver: conexão frota_rural_autoria, porta 5442.
SELECT u.email, u.categoria_autoria_id, g."Genero"
FROM users u LEFT JOIN "Genero" g ON g.id = u.categoria_autoria_id;
```

## 4 Frontend e falhas

| Ensaio | Resultado esperado |
| --- | --- |
| Escolher, salvar, F5 | Mesmo ID e nome recebidos da API |
| Enviar UUID `99999999-9999-4999-8999-999999999999` | 400; valor anterior permanece |
| Remover seleção, salvar | FK `null`; texto “Não informado” |
| Editar outro usuário como conta comum | 403/404; nenhum registro alterado |
| Acessar sem sessão | 401 |
| Catálogo indisponível | Mensagem de erro e seletor desabilitado |

## 5 Erros comuns

```text
200, mas FK continua null → campo ausente em InputSerializer.Meta.fields.
API contém nome, React não → schema Zod ou mapper descartando o campo.
PATCH salva, F5 perde     → verifique se GET inclui campo e frontend usa porta 8010.
Nome null com FK válida  → source deve ser categoria_autoria.Genero no seu modelo.
Catalogo quebra Zod      → saída esperada é id/nome, não id/Genero.
/api dá 404              → abrir /api/schema/swagger-ui.
Migration não encontra CategoriaAutoria → usar Genero no código atual, nomes históricos nas migrations.
401 login               → conta do seed + Teste1234; obter token antes do catálogo.
```

## 6 Mostrar na defesa

```text
1. Nova tabela e três linhas no DBeaver.
2. Migration da FK e classe do modelo existente.
3. InputSerializer → service existente → save/create.
4. Selecionar no frontend e salvar.
5. SELECT com JOIN + F5 no frontend: mesmo valor persistido.
```
