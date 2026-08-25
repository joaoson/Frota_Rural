# 7. Convenções

Regras operacionais do dia a dia. Se algo aqui conflitar com um documento anterior, o anterior vence
— este arquivo é sobre execução, não sobre desenho.

---

## 7.1 Onde colocar código novo

Fluxograma de decisão:

```
A regra existiria se o processo fosse feito no papel?
├── Sim  → domain/entities.py ou domain/value_objects.py
└── Não
    └── Orquestra várias entidades ou portas para realizar uma operação?
        ├── Sim → application/use_cases/
        └── Não
            └── Fala com banco, arquivo, rede ou biblioteca externa?
                ├── Sim → infrastructure/
                └── Não → interfaces/  (HTTP, parsing, roteamento)
```

Na dúvida, empurre **para dentro**. É mais fácil mover código do domínio para a borda do que o
contrário.

## 7.2 Nomenclatura

### Back-end (Python)

| Elemento | Convenção | Exemplo |
|---|---|---|
| Entidade | Substantivo singular | `OperatorLicense` |
| Value Object | Substantivo do conceito | `CPF`, `ValidationStatus` |
| Porta (ABC) | Substantivo do papel, sem sufixo `Interface` | `DocumentClassifier` |
| Adaptador | Tecnologia + papel | `SubprocessCnhClassifier` |
| Caso de uso | Verbo + substantivo + `UseCase` | `ReviewDocumentUseCase` |
| Repositório | Entidade + `Repository` | `OperatorLicenseRepository` |
| DTO | Caso de uso + `Input`/`Output` | `ReviewDocumentInput` |
| Exceção | Condição, não código HTTP | `RejectionRequiresNote` |

Não usar prefixo `I` em interfaces. **Padronizar `serializers.py` no plural** — hoje todos os apps
usam `serializer.py`, divergindo da convenção do Django e do DRF.

### Front-end (TypeScript)

| Elemento | Convenção | Exemplo |
|---|---|---|
| Entidade | `PascalCase`, arquivo `entities.ts` | `OperatorLicense` |
| Porta | `interface`, sem `I` | `OperatorLicenseRepository` |
| Adaptador | Transporte + porta | `HttpOperatorLicenseRepository` |
| Hook | `use` + substantivo | `useOperatorLicense` |
| Caso de uso | `camelCase`, verbo | `reviewDocument` |

Arquivos `.tsx` **apenas** com JSX. Hoje `PasswordResetService.tsx` não tem JSX nenhum.

## 7.3 Enums e constantes

**Nunca** literal de status no código.

```python
# ✗ views.py:222 — hoje
VALID_STATUSES = {"approved", "rejected"}
if user.status == 'banned': ...

# ✓
if document.validation_status is ValidationStatus.APPROVED: ...
```

Todo campo de estado precisa de `TextChoices` no model e de um enum de domínio correspondente.
Pendentes: `Users.role`, `Users.status`, `Postings.status`, `Machines.status`, `Rentals.status`,
`Contracts.status`.

No front, manter o idioma de objeto `const` + tipo homônimo, que já é usado em `UserRole.ts`:

```ts
export const ValidationStatus = { Pending: "pending", Approved: "approved", Rejected: "rejected" } as const;
export type ValidationStatus = (typeof ValidationStatus)[keyof typeof ValidationStatus];
```

## 7.4 Erros

### Back-end

Domínio levanta `DomainError`. Views **não** capturam erro de domínio — o exception handler de
`core/` traduz para HTTP. Nunca inspecionar texto de mensagem de erro do banco para decidir fluxo
(o que `users/views.py:22-27` faz hoje).

### Front-end

- `infrastructure/` traduz `AxiosError` em `DomainError` — **em todos os métodos**, sem exceção.
- Erros carregam `code` + `status`, nunca texto de UI já traduzido.
- A escolha da mensagem é da camada de apresentação.
- Três estilos coexistem hoje e devem convergir: engolir (`.catch(() => {})`,
  `DashboardLocador.tsx:329`), logar (`.catch(console.error)`) e `toast`.

## 7.5 Testes

| Arquivo | Precisa de Django? |
|---|---|
| `tests/test_entities.py` | Não |
| `tests/test_use_cases.py` | Não — usa fakes |
| `tests/test_views.py` | Sim |

Test doubles ficam em `tests/fakes.py`. Nomear `InMemory*` (implementação funcional) ou `Stub*`
(retorno fixo) — não `Mock*`, salvo quando for de fato um mock com verificação de interação.

## 7.6 Commits e branches

Mantida a convenção já praticada pelo time:

```
feat: AB-7983 license validation logic
refactor: AB-9025 extract review use case
docs: add architecture documentation
```

Tipos: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`.
Branches: `AB-<id>-descricao-curta`.

## 7.7 Checklist de Pull Request

**Arquitetura**

- [ ] `grep -rE "^(from|import) (django|rest_framework)" BackEnd/*/domain/ BackEnd/*/application/` retorna vazio
- [ ] `grep -rE "from ['\"](axios|react)" FrontEnd/src/features/*/domain/` retorna vazio
- [ ] Nenhum import direto de model entre bounded contexts
- [ ] View não contém regra de negócio nem query
- [ ] Repositório retorna entidade, nunca model do ORM
- [ ] Adaptador concreto instanciado apenas no composition root

**Qualidade**

- [ ] Nenhum literal de status — enum ou Value Object
- [ ] Escrita multi-tabela dentro de Unit of Work
- [ ] Erro de domínio como `DomainError`, não `Response` montada na mão
- [ ] Regra nova tem teste que roda sem banco
- [ ] Sem `any` no TypeScript (hoje há 8, sete deles em `DashboardLocador.tsx`)

**Higiene**

- [ ] Sem segredo em arquivo versionado
- [ ] Sem `console.log` / `print` de depuração (`authentication/views.py:98-99` imprime o token de
      reset em stdout quando `DEBUG`)
- [ ] Serializer sem `fields = '__all__'`

## 7.8 Ordem de migração sugerida

Da maior relação valor/risco para a menor:

1. `core/` — `DomainError`, exception handler, `UUIDTimeStampedModel` *(precisa de migration)*
2. `document_validation` — módulo piloto, autor único, sem conflito de branch
3. `administration` — corrige a transação ausente em `ban_user`, um defeito real
4. `machines` e `postings` — CRUD mais simples
5. `users` e `authentication` — deixar por último; mexem em autenticação
6. Front-end: `features/documents/` primeiro, espelhando o piloto do back-end

Migrar um contexto por vez, em branch própria, com merge rápido para reduzir divergência.

---

**Voltar ao início:** [`README.md`](README.md)
