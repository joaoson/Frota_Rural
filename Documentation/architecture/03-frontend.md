# 3. Front-end — React + Vite + TypeScript

## 3.1 Por que espelhar as camadas

Clean Architecture não é um padrão de back-end. A Regra da Dependência vale igual no cliente: React,
axios e `localStorage` são detalhes; "uma CNH vencida não habilita ninguém" não é.

Usar o mesmo vocabulário nas duas pontas tem um efeito prático: uma regra de negócio duplicada entre
front e back fica **visível**, porque aparece em `domain/` dos dois lados.

## 3.2 Estrutura por feature

Layout definido em `specification.md` e registrado em [ADR-009](06-adr.md). A migração está
**completa**: `src/services/` não existe mais.

```
src/
├── app/
│   ├── container.ts                 # composition root
│   ├── app.tsx                      # providers
│   ├── router.tsx                   # árvore de rotas
│   └── routes/{public,protected,admin}Routes.tsx
├── features/                        # 9 features, mesma forma em todas
│   ├── auth/  users/  machines/  postings/
│   ├── documents/  administration/  contracts/  reviews/
│   └── dashboard/                   # só apresentação: serve aos dois dashboards
├── shared/
│   ├── http/
│   │   ├── HttpClient.ts            # porta
│   │   ├── errors.ts
│   │   ├── AxiosHttpClient.ts       # único módulo que conhece axios
│   │   ├── ViaCepClient.ts          # segunda cadeia, sem decorators de auth
│   │   ├── queryClient.ts
│   │   └── decorators/{Authenticated,Refreshing,Logging}HttpClient.ts
│   ├── auth/{TokenProvider,SessionPort,InMemoryTokenStore,SessionService,jwt}.ts
│   ├── components/                  # 12 primitivos de apresentação (§3.9)
│   ├── hooks/useCepLookup.ts
│   ├── lib/maskedRegister.ts
│   └── utils/{masks,validation,clearSpecialChars,regexPatterns,getInitials,...}
├── pages/                           # camada de composição, por domínio (ADR-010)
│   ├── public/  auth/  dashboard/  machines/
│   └── postings/  documents/  contracts/  admin/
├── contexts/{authContextValue.ts, useAuth.ts, AuthContext.tsx}
├── components/  lib/(shadcn)  assets/
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
grep -rnE "^import .*from ['\"]axios['\"]" FrontEnd/src/          # só AxiosHttpClient.ts
grep -rnE "from ['\"]@/features/" FrontEnd/src/shared/            # vazio
grep -rnE "from ['\"]react['\"]" FrontEnd/src/features/*/types/ FrontEnd/src/features/*/api/   # vazio
grep -rn "new Http\|new AxiosHttpClient" FrontEnd/src/ | grep -v container.ts                   # vazio
```

## 3.3 A camada de hooks

Antes, não existia lugar entre "service" e "JSX" para lógica com estado — daí um dashboard de 2.378
linhas com 32 `useState`. Essa camada agora existe em `features/*/hooks/`. Um hook é um **Adapter**:
converte operações que não conhecem React no modelo de estado que o React entende.

```
antes:  service (HTTP)  →  [ VAZIO ]  →  página
depois: repository → store → hook → página
```

| Página | Antes | Depois da migração de dados | Depois da extração de componentes |
|---|---|---|---|
| `NovoEquipamento.tsx` | 343 linhas, 8 `useState` | 247, **0** | **186** |
| `CNHUpload.tsx` | 1.129 linhas, 32 `useState` | 834, 5 (só UI) | **612** |
| `Signup.tsx` | 539 linhas, 15 `useState` | 352, 1 | **255** |
| `DashboardLocador.tsx` | 2.378 linhas, 32 `useState` | 2.366, 24 | **1.572** |
| `DashboardLocatario.tsx` | 1.216 linhas, 25 `useState` | 1.227, 21 | **623** |
| `main.tsx` | 112 linhas | 12 | 12 |

A primeira coluna de "depois" é o que a migração de dados entregou. Os dashboards encolheram pouco
ali porque o volume deles é JSX, não lógica — o que saiu foi todo o estado de servidor. A segunda
coluna é a extração de componentes descrita em §3.9, que atacou justamente o JSX.

**As nove implementações de `validateField` desapareceram.** A última, em `EditEquipamentoModal`,
virou um adaptador de três linhas sobre `validateMachineEdit` — as regras vivem no schema zod da
feature `machines`.

## 3.4 TanStack Query como camada de estado de servidor

Antes, cada página reimplementava o trio `loading` / `erro` / `data`, e a manutenção de cache era
escrita à mão — o dashboard chamava `machineService.update` e depois remapeava o estado local para a
tela não ficar defasada.

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

`react-hook-form` + `zodResolver` substituíram **as nove implementações independentes de
`validateField`**, cada uma com sua própria convenção de mensagem e seu próprio reducer de erros.

Campos com máscara continuam uncontrolled via `shared/lib/maskedRegister.ts`, que reescreve o valor
antes de repassar o evento ao RHF.

Erros de campo vindos do backend são posicionados no campo correspondente via `form.setError`, não em
um toast genérico — um `renagro_number` duplicado aparece embaixo do input, com borda de erro.

## 3.8 Limpeza concluída

Removidos nesta migração:

- `src/services/` inteiro — os 8 serviços legados e o `AxiosInstance` com estado global mutável
- Código morto: `pages/Buscar.tsx` (duplicata não roteada de `BuscarMaquinario`), `pages/RouteStub.tsx`,
  `App.tsx`, `App.css` (arquivo vazio), `contexts/Constants.tsx`, `pages/Contrato/mock.ts`
- `react-router-dom`, que só era importado em dois arquivos por engano (o projeto usa `react-router`)
- `src/utils/` consolidado em `shared/utils/`; `utils/jwt.ts` substituído por `shared/auth/jwt.ts`,
  que ganhou o `try/catch` que faltava
- `src/.env`, que ficava no diretório errado para o Vite e cuja chave não tinha o prefixo `VITE_` —
  o `baseURL` sempre caía no fallback. Agora há `FrontEnd/.env` (ignorado pelo git) e `.env.example`

Defeitos corrigidos de passagem, que o `any` escondia:

- `GerenciarAnuncio` lia `posting.machinery_details`, campo inexistente na resposta de detalhe
- Nomes de locador/locatário eram decididos por ids chumbados (`"lessor-default"`, `"locatario-default"`)
  que nunca chegavam; agora vêm denormalizados da API
- `showAvaliar` / `showDetalhes` / `showReagendar` eram tipados `number` para ids que são UUID
- Colunas nullable (`renagro`, `brand`, `model`, `purpose`) eram passadas como `string`

Pendência conhecida: em `DashboardLocatario`, o `reviewee` e o `rental` de uma nova avaliação seguem
chumbados. O id da locação está em escopo, mas **a API de rentals não devolve o id do locador** — só
`lessor_name` — então não há como derivar o avaliado sem mudança no backend.

## 3.9 Camada de apresentação

A migração de dados deixou intacta a camada de cima. `pages/` tinha ~8.700 linhas com JSX duplicado
em escala — parte dela introduzida pela própria migração, feita página por página.

O achado que decidiu a rodada: **a duplicação mais cara não estava dentro dos dashboards, estava
entre eles.** `DashboardLocador` e `DashboardLocatario` compartilhavam ~750 linhas de JSX
praticamente idêntico.

### `shared/components/` — genéricos, sem conhecer domínio

| Componente | Substituiu | Ocorrências hoje |
|---|---|---|
| `PageShell` | Shell `Navbar`+conteúdo+`Footer` de 15 páginas | 16 |
| `PageHeader` | 3 variantes de cabeçalho | 8 |
| `FormField` | Bloco rótulo + campo + erro | 68 |
| `inputStyles.ts` | **7 cópias byte a byte** de `INPUT_BASE` + `inputClass()` | 8 imports |
| `PasswordField` | 10 cópias do botão de mostrar/ocultar, cada uma com seu `useState` | 7 |
| `StatusBadge` | 6 implementações de `statusBadge`, 3 formatos | 6 |
| `GradientButton` | 19 botões, 6 variantes de `className` | 4 |
| `FileDropzone` | 4 implementações de área de upload | 4 |
| `StarRating` | 3 das 4 fileiras de estrelas | 3 |
| `BackLink` | 7 links "voltar", `className` idêntico | 7 |
| `LoadingState` / `ErrorState` / `EmptyState` | 5 tratamentos de carregamento, 3 de erro, 7 de lista vazia | 7 |

### `features/*/components/`

| Componente | Substituiu |
|---|---|
| `administration/AdminPage` | `<header>` + Atualizar + `ThemeToggle` das 3 telas de moderação, `className` byte a byte igual |
| `administration/AdminFilterBar` | Busca + selects, 3 páginas |
| `administration/AdminTable` | Moldura da tabela + `TableHead` repetido 13× |
| `dashboard/DashboardShell` | Sidebar + topbar + diálogo de saída, 2 cópias de ~100 linhas |
| `dashboard/AccountSection` | Aba "Minha Conta", 2 cópias de ~200 linhas e ~15 `useState` cada |
| `dashboard/RentalCard` | `renderRentalCard`, 2 cópias de ~200 linhas |
| `dashboard/ReviewsSection` | Aba de avaliações — idênticas a menos de espaço em branco |

`features/dashboard/` é a única feature só de apresentação, sem `api/`: estes componentes servem aos
**dois** dashboards, então não pertencem a nenhuma das features de dados.

### Regra de fronteira

`shared/` não importa `features/`. É por isso que `StatusBadge` recebe um `BadgeConfig` pronto:
traduzir `status → {ícone, cor, rótulo}` é regra de domínio e vive em
`features/<f>/types/<dominio>Badges.ts` — `userBadges`, `postingBadges`, `documentBadges`,
`rentalBadges`.

### Divergências de comportamento resolvidas

Unificar expôs que as cópias tinham divergido, não só em estilo:

- **`AccountSection`**: o dashboard do locatário não validava CPF nem telefone (`pattern` + `title`),
  falhava em silêncio quando o CEP não existia (`console.error` em vez de `toast.error`) e não
  limpava o `setCustomValidity` ao digitar. Prevaleceu o comportamento do locador, mais completo.
- **`rentalStatusBadge`**: a cópia do locatário não cobria `validating` — caía no ramo vazio e não
  mostrava selo nenhum. Agora os dois exibem "Aguardando Validação".
- **`FileDropzone`**: a área de upload de `NovoAnuncio` não tinha estado de arraste — nenhum retorno
  visual ao arrastar um arquivo. Ganhou de graça.

### Defeitos corrigidos de passagem

- **`GerenciarAnuncio` renderizava erro que nunca aparecia.** Usava um `FIELD` próprio, sem estado de
  erro: as mensagens existiam, mas o input nunca ficava vermelho. `FormField` + `inputClass`
  corrigem — verificado no navegador, com só os dois campos inválidos em `border-error`.
- **`ui/sonner.tsx` era código morto.** `app/app.tsx` importava `Toaster` direto de `"sonner"`, então
  os ícones e as variáveis de tema do wrapper nunca se aplicavam.
- **`Contrato.css` vazava no `@media print`.** `.page`, `.no-print` e `body` estavam fora do escopo
  `.contrato-root`, num CSS que entra no bundle global. Hoje os quatro seletores da media query de
  impressão começam com `.contrato-root`.
- **`Reservar` tinha rótulo errado no link de voltar**: dizia "Voltar à busca" e navegava para o
  detalhe do anúncio.
- **`Help.tsx` era um stub de 10 linhas linkado no rodapé** — quem clicava em "Ajuda" caía numa tela
  crua, sem `Navbar` nem `Footer`.
- **`BuscarMaquinario` era a única página com `lucide-react`**; o resto usa `MaterialIcon`. Os sete
  ícones foram normalizados, e `lucide-react` ficou restrito aos arquivos vendidos do shadcn.

### O que ficou de fora, e por quê

- **Dados mock**, que são muitos: o painel de "Estatísticas" de `GerenciarAnuncio` é inteiro
  fabricado; os 4 KPIs do `DashboardLocatario` são fixos; chat e notificações são 100% mock;
  `DashboardSearchBar` e `DashboardPagination` aparecem com handlers no-op em 6+ lugares. Remover
  isso é decisão de produto.
- **Dividir os dashboards em um componente por aba.** Extrair o que estava duplicado *entre* os dois
  é deduplicação; reestruturar o sistema de abas seria outra mudança, com outro risco.
- **Adotar o `Field` do shadcn**, que está baixado e nunca foi usado: ele fala o vocabulário de
  tokens do shadcn (`border-input`, `text-muted-foreground`) enquanto as páginas falam os aliases M3
  (`bg-surface-container`, `text-on-surface-variant`). Adotá-lo mudaria a aparência de todo
  formulário.

---

**Próximo:** [`04-pattern-catalog.md`](04-pattern-catalog.md) · **Referência:** [`reference/frontend-documents-feature.md`](reference/frontend-documents-feature.md)
