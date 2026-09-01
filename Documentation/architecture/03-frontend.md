# 3. Front-end — React + Vite + TypeScript

## 3.1 Por que espelhar as camadas

Clean Architecture não é um padrão de back-end. A Regra da Dependência vale igual no cliente: React,
axios e `localStorage` são detalhes; "uma CNH vencida não habilita ninguém" não é.

Usar o mesmo vocabulário nas duas pontas tem um efeito prático: uma regra de negócio duplicada entre
front e back fica **visível**, porque aparece em `domain/` dos dois lados.

## 3.2 Estrutura por feature

Layout definido em `specification.md` e registrado em [ADR-009](06-adr.md). Abaixo, o que está de
fato implementado:

```
src/
├── app/
│   ├── container.ts                 # composition root
│   ├── app.tsx                      # providers
│   ├── router.tsx                   # árvore de rotas
│   └── routes/{public,protected,admin}Routes.tsx
├── features/
│   ├── auth/          types/ api/ hooks/
│   ├── users/         types/ api/ hooks/
│   ├── machines/      types/ api/ hooks/ components/
│   ├── postings/      types/ api/ hooks/
│   ├── documents/     types/ api/ hooks/
│   └── administration/types/ api/ hooks/
├── shared/
│   ├── http/
│   │   ├── HttpClient.ts            # porta
│   │   ├── errors.ts
│   │   ├── AxiosHttpClient.ts       # único módulo que conhece axios
│   │   ├── ViaCepClient.ts
│   │   ├── queryClient.ts
│   │   └── decorators/{Authenticated,Refreshing,Logging}HttpClient.ts
│   ├── auth/{TokenProvider,SessionPort,InMemoryTokenStore,SessionService,jwt}.ts
│   ├── hooks/useCepLookup.ts
│   └── lib/{maskedRegister,brazilianStates}.ts
├── pages/                           # composição e rota
└── services/                        # LEGADO — ainda serve os god components
```

Dentro de cada feature, o padrão é sempre o mesmo:

| Arquivo | Papel |
|---|---|
| `types/*Schemas.ts` | zod: resposta da API, formulário, payload |
| `types/<entidade>.ts` | Entidade de domínio em camelCase + regras puras |
| `api/*Mapper.ts` | DTO ↔ entidade. **O `snake_case` morre aqui** |
| `api/*Repository.ts` | Interface + implementação HTTP, recebendo `HttpClient` por construtor |
| `api/*Store.ts` | Chaves de cache, invalidação e `clear()` |
| `hooks/use*.ts` | Ponte com o React |
| `components/` | Apresentacionais |

Regras de import, verificáveis por arquivo (não há pasta `domain/` isolada — ver ADR-009):

```bash
grep -rnE "^import .*from ['\"]axios['\"]" FrontEnd/src/features/ FrontEnd/src/shared/ FrontEnd/src/app/
grep -rnE "from ['\"]@/features/" FrontEnd/src/shared/
grep -rnE "from ['\"]react" FrontEnd/src/features/*/types/ FrontEnd/src/features/*/api/
```

Os três devem sair vazios, exceto o primeiro em `shared/http/AxiosHttpClient.ts`.

### Coexistência declarada

`services/` continua no repositório porque `DashboardLocador`, `DashboardLocatario`, `Buscar`,
`BuscarMaquinario`, `Reservar`, `AnuncioDetalhe` e `Contrato` ainda dependem dele. `AuthContext`
escreve o token nos dois caminhos de propósito. `services/` só pode ser removido quando o último
consumidor migrar — junto com as features `contracts` e `reviews`, que hoje só teriam consumidores
fora de escopo.

## 3.3 A camada de hooks

`DashboardLocador.tsx` tem 2.378 linhas, 32 `useState` e 11 abas comutadas por `useState<Tab>` — o
JSX das onze abas vive em um único `return`. Não é descuido: é o que acontece quando **não existe
lugar entre "service" e "JSX"** para lógica com estado.

Essa camada agora existe em `features/*/hooks/`. Um hook é um **Adapter**: converte operações que não
conhecem React no modelo de estado que o React entende.

```
antes:  service (HTTP)  →  [ VAZIO ]  →  página de 2.378 linhas
depois: repository      →  store  →  hook  →  página de composição
```

Efeito medido nas páginas migradas:

| Página | Antes | Depois |
|---|---|---|
| `NovoEquipamento.tsx` | 343 linhas, 8 `useState` | 247, **0** |
| `CNHUpload.tsx` | 1.129 linhas, 32 `useState` | 834, **5** (só UI) |
| `Signup.tsx` | 539 linhas, 15 `useState` | 352, 1 |
| `Login.tsx` | 185 linhas, 6 `useState` | 151, 1 |
| `main.tsx` | 112 linhas | 12 |

Os `useState` que sobraram são estado de UI legítimo — arquivo selecionado, drag-and-drop,
visibilidade de senha. Nenhum campo de formulário e nenhum estado de servidor.

## 3.4 TanStack Query como camada de estado de servidor

Sem biblioteca de estado de servidor, cada página reimplementa o mesmo trio `loading` / `erro` /
`data`: `Reservar.tsx:120`, `AnuncioDetalhe.tsx:77`, `GerenciarAnuncio.tsx:24`,
`Admin/Documentos.tsx:100`. E a manutenção de cache acaba escrita à mão — `DashboardLocador.tsx:727`
chama `machineService.update` e depois remapeia o estado local para a tela não ficar defasada.

O projeto adota `@tanstack/react-query` ([ADR-006](06-adr.md)). A divisão fica assim:

| Peça | Responsabilidade |
|---|---|
| `api/<Feature>Store.ts` | Chaves de cache, `invalidateLists()`, `clear()`. Opera sobre o `QueryClient`, **não conhece React** |
| `hooks/use*.ts` | Ponte com o React: `useQuery` / `useMutation` |
| `app/container.ts` | Cria o `QueryClient` único |

O `clear()` não é opcional: sem ele, o próximo usuário a logar na mesma aba enxerga o cache do
anterior. `AuthContext.logout()` chama `clearAllStores()`.

A invalidação já se paga: reprovar um anúncio em `/admin/anuncios` invalida `postingKeys.lists()` e
a tabela se atualiza sozinha, sem recarregar a página na mão. O mesmo vale para moderação de usuário
e revisão de documento.

## 3.5 Contrato uniforme de repositório

Os serviços legados eram inconsistentes: só três dos oito tinham `models/` + `errors/`, metade dos
métodos de `OperatorDocumentService` não tinha try/catch (deixando `AxiosError` cru vazar), e
`PostingService.getById` devolvia `any` — motivo pelo qual quatro páginas escreveram à mão o próprio
formato de anúncio.

Todo repositório migrado segue as mesmas três regras:

1. **Todo método retorna entidade de domínio tipada**, validada por zod antes de mapear.
2. **Todo erro de transporte vira `HttpError`** no `AxiosHttpClient` — um único lugar, para todos.
3. **Erros carregam `code` + `status`, não texto de UI.** A escolha da mensagem é da página.

Erros de negócio ganham subclasse própria quando o mesmo status significa coisas diferentes:
`InvalidCredentials` (401 no login) é distinto de `UnauthorizedError` (sessão expirada em qualquer
outra chamada) — e é por isso que o `AuthRepository` recebe o cliente **cru**, sem o decorator de
refresh.

## 3.6 zod como Anti-Corruption Layer

Cada feature tem `types/*Schemas.ts` com os schemas de resposta, e `api/*Mapper.ts` converte para a
entidade de domínio. **O `snake_case` da API morre no mapper** — nada acima dele vê `renagro_number`
ou `validation_status`.

Dois ganhos concretos:

- O tipo deixou de ser promessa de compilação e passou a ser verificado em runtime. Antes,
  `OperatorLicense` era um `type` apagado no build: uma mudança de campo no backend quebrava em
  produção, não no `tsc`.
- Regras de negócio que estavam espalhadas ganharam dono. O dispatcher de documento — 11 dígitos ⇒
  CPF, 14 ⇒ CNPJ — estava **copiado em três páginas** e agora vive em
  `features/users/types/userSchemas.ts`. As 17 regras do formulário de CNH viraram um schema só.

## 3.7 Formulários

`react-hook-form` + `zodResolver` substituíram **oito implementações independentes de
`validateField`**, cada uma com sua própria convenção de mensagem e seu próprio reducer de erros.

Campos com máscara continuam uncontrolled via `shared/lib/maskedRegister.ts`, que reescreve o valor
antes de repassar o evento ao RHF.

Erros de campo vindos do backend são posicionados no campo correspondente via `form.setError`, não em
um toast genérico — um `renagro_number` duplicado aparece embaixo do input, com borda de erro.

## 3.8 Correções de configuração

- `src/.env` está no diretório errado (o Vite lê da raiz do projeto) **e** sua chave não tem o prefixo
  `VITE_`. Resultado: `AxiosInstance.ts:4` sempre usa o fallback `http://localhost:8000/api/`. Deve
  virar `FrontEnd/.env` com `VITE_API_BASE_URL`.
- `main.tsx:43,48` têm comentários `//` como filhos JSX de `<Routes>` — renderizam como texto.
- `react-router-dom` está instalado e nunca é importado (só `react-router`).
- `App.tsx` é importado em `main.tsx:5` e nunca renderizado; `RouteStub.tsx` e
  `contexts/Constants.tsx` são código morto.
- Não existe **error boundary** em lugar nenhum. Um erro de render deixa a aplicação em branco.
- O interceptor de refresh em `AxiosInstance.ts:31-57` não deduplica chamadas concorrentes: dois 401
  simultâneos disparam dois refreshes.

---

**Próximo:** [`04-pattern-catalog.md`](04-pattern-catalog.md) · **Referência:** [`reference/frontend-documents-feature.md`](reference/frontend-documents-feature.md)
