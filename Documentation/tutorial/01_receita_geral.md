# Receita geral — tabela nova + FK + select + exibição

Esta é a receita que todos os guias seguem, com nomes genéricos. Para ver cada passo aplicado de verdade, abra o [exemplo da máquina](02_exemplo_maquina_tipo_pneu.md).

## 1. Entender o caminho do dado

```text
            ┌──────────── leitura das opções ────────────┐
tabela nova ── GET /api/<app>/<catalogo> ── Repository ── Store ── hook ── <select>
     ▲                                                                       │ value = ID
     │ FK                                                                    ▼
tabela existente ◄── serializer.save() ◄── InputSerializer ◄── POST/PATCH ◄── mapper (payload)
     │
     └── OutputSerializer (<fk>, <fk>_nome) ── Zod ── mapper (domínio) ── tela (após F5)
```

O professor vai pedir para você explicar esse caminho. Se o dado aparece depois de um **F5**, ele veio do banco e não da memória do formulário.

## 2. Escolher os nomes

| Coisa | Convenção | Máquina (exemplo) | Seu pedido |
| --- | --- | --- | --- |
| Classe do model novo | PascalCase, singular | `TipoPneu` | `Combustivel` |
| Tabela (`db_table`) | snake_case, plural | `tipos_pneu` | `combustiveis` |
| Campo FK no model existente | snake_case, singular | `tipo_pneu` → coluna `tipo_pneu_id` | `combustivel` |
| Campo de texto na saída | `<fk>_nome` | `tipo_pneu_nome` | `combustivel_nome` |
| URL do catálogo | `<recurso>/<plural-com-hífen>` | `machines/tipos-pneu` | `machines/combustiveis` |
| Serializer / Service / View | `<Classe>OutputSerializer`, `<Classe>Service`, `<Classe>ListView` | `TipoPneuListView` | `CombustivelListView` |
| Domínio no front | camelCase | `tipoPneuId`, `tipoPneuNome` | `combustivelId`, `combustivelNome` |
| Campo do formulário | camelCase | `tipoPneu` | `combustivel` |
| Hook | `use<Plural>` | `useTiposPneu` | `useCombustiveis` |

**Onde fica a tabela nova:** no **mesmo app Django** do model que recebe a FK. Para máquina, `machines/models.py`. Assim você não precisa criar app, nem mexer em `INSTALLED_APPS` ou em `djangoapi/urls.py`.

> O ensaio antigo usou um app separado (`autoria`). Também funciona, mas exige `startapp`, registrar o app em `settings.py` e incluir as URLs dele em `djangoapi/urls.py`. Ou seja, mais três lugares para errar durante a defesa.

## 3. Os 11 passos

### Backend (`BackEnd/<app>/`)

**1. Model da tabela nova** (`models.py`, antes do model existente):

```python
class NovaTabela(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=60, unique=True)

    class Meta:
        db_table = "nova_tabela_plural"
        ordering = ["nome"]

    def __str__(self) -> str:
        return self.nome
```

**2. FK no model existente** (antes do `class Meta` dele):

```python
    novo_campo = models.ForeignKey(NovaTabela, models.PROTECT, blank=True, null=True)
```

- `null=True`: os registros antigos continuam válidos.
- `PROTECT`: impede apagar uma opção que está em uso.

**3. Migrations:**

```bash
python manage.py makemigrations <app>
python manage.py makemigrations <app> --empty --name <plural>_iniciais
# preencher a migration vazia com RunPython (ver exemplo), depois:
python manage.py migrate
```

**4. Serializers** (`serializer.py`):
- `"novo_campo"` no `Meta.fields` do **InputSerializer** que o service usa.
- `novo_campo_nome = serializers.CharField(source="novo_campo.nome", read_only=True, allow_null=True)` no **OutputSerializer** que a tela lê, mais `"novo_campo", "novo_campo_nome"` no `Meta.fields` dele.
- `NovaTabelaOutputSerializer` com `fields = ["id", "nome"]`.

**5. Service do catálogo** (`services.py`):

```python
class NovaTabelaService:
    @staticmethod
    def list() -> QuerySet[NovaTabela]:
        return NovaTabela.objects.order_by("nome")
```

O create/update do model existente normalmente **não muda**: se ele usa `serializer.save()`, a FK validada já é gravada. Cada guia confirma isso no service real.

**6. View + URL** do catálogo (`views.py`, `urls.py`):
- Uma `APIView` com `get`.
- Permissão: `IsAuthenticatedOrReadOnly`, `IsAuthenticated` ou `AllowAny`, conforme a tela. O cadastro público (Signup) precisa de `AllowAny`.
- Teste no Swagger antes de seguir.

### Frontend (`FrontEnd/src/features/<feature>/`)

**7. Tipos e Zod** (`types/`):
- No tipo de domínio: `novoCampoId: string | null; novoCampoNome: string | null;`.
- No schema da API: `novo_campo: z.string().nullish(), novo_campo_nome: z.string().nullish(),`.
- Schema da lista do catálogo: `z.array(z.object({ id: z.string(), nome: z.string() }))`.
- No schema do **formulário** (se for react-hook-form): `novoCampo: z.string()`.
- No **payload**: `novo_campo?: string | null`.

**8. Mapper** (`api/*Mapper.ts`):
- Leitura: `novoCampoId: dto.novo_campo ?? null`.
- Escrita: `novo_campo: values.novoCampo || null`.

**9. Buscar o catálogo:** um método no Repository (`GET` + `parse`), outro no Store e um hook. Ou siga o padrão que a tela já usa (ver a seção 4).

**10. Componente:**

```tsx
<select value={valor} onChange={...}>
  <option value="">Selecione…</option>
  {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
</select>
```

O `value` é o **ID**; o texto é o `nome`. Na edição, carregue o valor salvo (`novoCampoId`) no estado inicial do formulário.

**11. Exibição:** mostre `novoCampoNome` na tela que lê do banco (card, detalhe, perfil). Depois, F5.

## 4. Os três padrões de tela do projeto

Cada tela gerencia o formulário de um jeito. Siga o padrão que **ela já usa**:

| Padrão | Como reconhecer | Telas | Como ligar o select | Como carregar as opções |
| --- | --- | --- | --- | --- |
| react-hook-form + Zod | `useXxxForm()`, `form.register("campo")` | NovoEquipamento, NovoAnuncio, GerenciarAnuncio, Signup | `{...form.register("novoCampo")}` + default no `useXxxForm` + campo no schema | hook React Query (`useNovaTabela()`) |
| `useState` por campo | `const [formX, setFormX] = useState("")` | Minha Conta (`AccountSection`), modal de edição de máquina | `value={estado}` + `onChange={(e) => setEstado(e.target.value)}` | hook React Query, ou prop vinda do pai |
| `useState` + store direto | `contractStore.xxx().then(...)` dentro de `useEffect` | Reservar, OperadoresPanel | idem acima | `useEffect` chamando o store (igual a `bookingPolicy` ou `loadOperators`) |

Por que isso importa: os testes de cada tela foram escritos para o padrão dela. Por exemplo, um `useQuery` novo numa tela testada sem `QueryClientProvider` quebra com `No QueryClient set`. Os guias listam esses casos e a correção.

## 5. Ordem que evita retrabalho

1. Backend inteiro + `migrate`.
2. Swagger: o GET do catálogo devolve 3 itens; o PATCH/POST com o ID devolve `<fk>_nome`.
3. Frontend: tipos/Zod → mapper → catálogo → select → exibição.
4. Tela: salvar → F5 → ver o nome. Banco: `SELECT` com `JOIN`.
5. `npx tsc -b` e os testes das pastas mexidas.
