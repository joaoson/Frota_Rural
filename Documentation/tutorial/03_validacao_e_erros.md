# Validar o exercício

## 1 Banco e migrations

```bash
docker exec "$AUTORIA_BACKEND" python manage.py check
docker exec "$AUTORIA_BACKEND" python manage.py makemigrations --check --dry-run
docker exec "$AUTORIA_BACKEND" python manage.py migrate --plan
docker exec "$AUTORIA_BACKEND" python manage.py showmigrations autoria
docker exec "$AUTORIA_BACKEND" python manage.py shell -c 'from autoria.models import CategoriaAutoria; assert CategoriaAutoria.objects.count() == 3; print(list(CategoriaAutoria.objects.values("id", "nome")))'
```

## 2 Login e API

```bash
# As contas do seed local usam Teste1234; preserve senhas que você já alterou.
AUTORIA_TOKEN=$(curl --fail-with-body -s "$AUTORIA_API/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"joao.silva@example.test","password":"Teste1234"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access"])')

curl --fail-with-body "$AUTORIA_API/autoria/categorias" \
  -H "Authorization: Bearer $AUTORIA_TOKEN"

# Para os guias exclusivos de administrador, faça o mesmo login com admin@example.test.
# Depois execute PATCH/GET usando o ID e a URL do guia do modelo escolhido.
```

```json
{
  "id": "ID_REAL_DO_REGISTRO",
  "categoria_id": "33333333-3333-4333-8333-333333333333",
  "categoria_nome": "Prioridade"
}
```

## 3 Teste executável para o guia Users

Use depois de aplicar [Users](modelos/users.md). Este teste cria seu próprio banco de testes local.

<!-- file: BackEnd/autoria/tests.py -->
```python
from datetime import date
from uuid import uuid4

from django.db.models.deletion import ProtectedError
from rest_framework.test import APITestCase

from autoria.models import CategoriaAutoria
from users.models import Users


class AutoriaUsuariosTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.usuario = Users.objects.create_user(
            email="autoria@example.test", password="SenhaDeTeste123",
            name="Pessoa de teste", document="AUTORIA-01", role="locatario",
            address="Endereço de teste", birth_date=date(1990, 1, 1), status="active",
        )
        cls.outro = Users.objects.create_user(
            email="outro-autoria@example.test", password="OutraSenha123",
            name="Outro usuário", document="AUTORIA-02", role="locatario",
            address="Outro endereço", birth_date=date(1991, 1, 1), status="active",
        )

    def setUp(self):
        self.client.force_authenticate(self.usuario)
        self.url = f"/api/autoria/users/{self.usuario.pk}"

    def test_catalogo_veio_da_migration(self):
        response = self.client.get("/api/autoria/categorias")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["nome"] for item in response.data},
                         {"Rotina", "Acompanhamento", "Prioridade"})
        self.assertEqual(len(response.data), 3)

    def test_grava_fk_e_rele_o_nome_no_banco(self):
        categoria = CategoriaAutoria.objects.get(nome="Prioridade")
        senha_original = self.usuario.password
        response = self.client.patch(self.url, {"categoria_id": str(categoria.pk)}, format="json")
        self.assertEqual(response.status_code, 200)
        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.categoria_autoria_id, categoria.pk)
        self.assertEqual(self.usuario.password, senha_original)
        self.assertEqual(self.usuario.role, "locatario")
        data = self.client.get(self.url).data
        self.assertEqual(data["categoria_nome"], "Prioridade")
        self.assertEqual(set(data), {"id", "categoria_id", "categoria_nome"})

    def test_fk_inexistente_e_rejeitada(self):
        response = self.client.patch(self.url, {"categoria_id": str(uuid4())}, format="json")
        self.assertEqual(response.status_code, 400)
        self.usuario.refresh_from_db()
        self.assertIsNone(self.usuario.categoria_autoria_id)

    def test_nao_classifica_outro_usuario(self):
        categoria = CategoriaAutoria.objects.get(nome="Rotina")
        response = self.client.patch(f"/api/autoria/users/{self.outro.pk}",
                                     {"categoria_id": str(categoria.pk)}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_campos_de_privilegio_nao_entram_no_patch(self):
        categoria = CategoriaAutoria.objects.get(nome="Rotina")
        response = self.client.patch(self.url,
            {"categoria_id": str(categoria.pk), "role": "admin"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.usuario.refresh_from_db()
        self.assertEqual(self.usuario.role, "locatario")
        self.assertIsNone(self.usuario.categoria_autoria_id)

    def test_catalogo_exige_login(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get("/api/autoria/categorias").status_code, 401)

    def test_categoria_em_uso_e_protegida(self):
        categoria = CategoriaAutoria.objects.get(nome="Rotina")
        self.client.patch(self.url, {"categoria_id": str(categoria.pk)}, format="json")
        with self.assertRaises(ProtectedError):
            categoria.delete()
```

```bash
# Somente no PostgreSQL local; não executar testes na conexão Supabase.
docker exec "$AUTORIA_BACKEND" python manage.py test autoria --noinput
docker exec "$AUTORIA_BACKEND" python manage.py spectacular --validate --fail-on-warn --file /tmp/autoria-schema.yaml
```

## 4 Frontend

```bash
cd FrontEnd
npm run build
npm run lint
```

```text
Login -> /autoria/users/ID_DO_USUARIO
Selecionar Prioridade -> Salvar categoria
Network: PATCH 200 seguido de GET 200
Valor persistido: Prioridade
F5 -> Valor persistido: Prioridade
```

## 5 Conferir por SQL usando a conexão do Django

```bash
docker exec -i "$AUTORIA_BACKEND" python manage.py shell <<'PY'
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute("""
        SELECT u.id, u.categoria_autoria_id, c.nome
        FROM users u
        LEFT JOIN categorias_autoria c ON c.id = u.categoria_autoria_id
        ORDER BY u.id
    """)
    print(cursor.fetchall())
PY
```

## 6 Erros frequentes

| Sintoma | Corrigir |
| --- | --- |
| `relation categorias_autoria does not exist` | Registrar app, gerar migration e executar `migrate` no mesmo banco da API. |
| `column categoria_autoria_id does not exist` | Gerar e aplicar a migration do modelo existente. |
| `No installed app with label autoria` | Acrescentar `autoria` em `INSTALLED_APPS`. |
| 404 no endpoint | Incluir `autoria.urls`, adicionar o `path` do modelo e conferir ID/permissão. |
| 401 | Fazer login; usar `httpClient` do container, que envia/renova token. |
| 403/404 para outro registro | Usar o responsável pelo registro ou a conta admin, conforme o guia. |
| 400 na categoria | Enviar UUID real em `categoria_id`, não o nome nem o objeto inteiro. |
| 405 em revisão/assinatura | A gravação é na criação; usar o guia específico e não remover as triggers. |
| Nome some no F5 | Conferir PATCH, FK no banco e GET; não exibir apenas o state do select. |
| Nome não chega ao componente | Na API original, atualizar também schema Zod, mapper e tipo; na API do tutorial, usar `vinculoSchema`. |
| Migration pede default | A FK nova deve começar com `null=True, blank=True`. |
| `PROTECT` impede excluir categoria | Existe registro referenciando-a; é a integridade da FK. |
| Tentativa de rollback bloqueada | Reverter primeiro a migration que adicionou a FK, conforme `migrate --plan`; não apagar dados do banco para contornar. |

## 7 Mostrar durante a defesa

```text
models.py             -> nova tabela e ForeignKey na tabela existente
migrations/0002...    -> três INSERTs feitos pelo ORM histórico
serializers.py        -> valida ID recebido e retorna o nome relacionado
*_services.py         -> confere acesso e salva categoria_autoria
urls.py               -> liga endpoint à view
AutoriaRepository.ts  -> GET/PATCH reais
CategoriaSelect.tsx   -> opções carregadas da tabela
CategoriaEditor.tsx   -> salva; relê o banco; mostra categoria_nome
SQL JOIN + F5         -> comprova persistência e relacionamento
```
