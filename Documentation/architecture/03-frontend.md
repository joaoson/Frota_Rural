# 3. Front-end — React + Vite + TypeScript

## 3.1 Por que espelhar as camadas

Clean Architecture não é um padrão de back-end. A Regra da Dependência vale igual no cliente: React,
axios e `localStorage` são detalhes; "uma CNH vencida não habilita ninguém" não é.

Usar o mesmo vocabulário nas duas pontas tem um efeito prático: uma regra de negócio duplicada entre
front e back fica **visível**, porque aparece em `domain/` dos dois lados.

## 3.2 Estrutura por feature

```
src/
├── features/
│   └── documents/
│       ├── domain/
│       │   ├── entities.ts          # OperatorLicense, Certification (com comportamento)
│       │   ├── valueObjects.ts      # CPF, ValidationStatus
│       │   ├── errors.ts            # DomainError com code + status
│       │   └── repositories.ts      # interface OperatorLicenseRepository
│       ├── application/
│       │   ├── dto.ts
│       │   └── useCases/            # reviewDocument, submitLicense
│       ├── infrastructure/
│       │   ├── HttpOperatorLicenseRepository.ts   # adaptador axios
│       │   ├── schemas.ts                          # zod — Anti-Corruption Layer
│       │   └── mappers.ts                          # DTO da API <-> entidade
│       └── presentation/
│           ├── hooks/               # useOperatorLicense, useCnhForm
│           └── components/          # apresentacionais
├── shared/
│   ├── api/AxiosInstance.ts
│   ├── hooks/useAsync.ts
│   ├── ui/                          # shadcn
│   └── lib/
└── pages/                           # composição e rota apenas
```

Regras de import equivalentes às do back-end: `domain/` não importa `react` nem `axios`;
`application/` importa só `domain/`; `infrastructure/` e `presentation/` são a borda.

```bash
grep -rE "from ['\"](axios|react)" FrontEnd/src/features/*/domain/
```

## 3.3 A camada que falta hoje

`DashboardLocador.tsx` tem **2.493 linhas**, 21 `useState` e 11 abas comutadas por
`useState<Tab>` — o que faz o JSX das onze abas viver em um único `return`.

Esse arquivo não é grande por descuido. É grande porque **não existe lugar entre "service" e "JSX"
para lógica com estado**. Todo o resto deste documento decorre disso.

A camada ausente é `presentation/hooks/`. Um hook é um **Adapter**: traduz um caso de uso, que não
sabe nada de React, no modelo de estado que o React entende.

```
service (HTTP)  →  [ VAZIO ]  →  página de 2.493 linhas
service (HTTP)  →  hooks      →  página de composição + componentes apresentacionais
```

## 3.4 `useAsync` — o substituto sem dependências

Sem biblioteca de estado de servidor, cada página reimplementa o mesmo trio `loading` / `erro` /
`data`: `Reservar.tsx:120`, `AnuncioDetalhe.tsx:77`, `GerenciarAnuncio.tsx:24`,
`Admin/Documentos.tsx:100`.

Um `useAsync<T>` em `shared/hooks/` centraliza isso.

> **Trade-off declarado.** `useAsync` não é TanStack Query. Não há cache, nem deduplicação de
> requisições em voo, nem revalidação em background, nem invalidação. Toda montagem de página
> refaz a requisição. Isso é consequência da restrição de não adicionar dependências, e está
> registrado em [ADR-006](06-adr.md).

Consequência visível hoje: `DashboardLocador.tsx:329-375` busca **todos** os anúncios do sistema e
filtra no cliente, porque não há camada que saiba pedir só o necessário.

## 3.5 Contrato de serviço uniforme

Dos seis serviços atuais, apenas três (`OperatorDocumentService`, `UserService`,
`PasswordResetService`) têm `models/` + `errors/`. `MachineService` e `PostingService` declaram tipos
inline; `AdminService` e `AdminPostingService` declaram classes de erro dentro do próprio arquivo.

Após a migração, `infrastructure/` de cada feature segue três regras:

**1. Todo método retorna tipo.** `PostingService.getById` não tem anotação de retorno e devolve
`any`. É por isso que quatro páginas escreveram à mão o próprio formato de posting:
`AnuncioDetalhe.tsx:15`, `BuscarMaquinario.tsx:39`, `Reservar.tsx:15`, `Admin/Anuncios.tsx:28`. Um
tipo de retorno elimina quatro DTOs duplicados.

**2. Todo método mapeia erro.** Em `OperatorDocumentService`, `listLicenses` (`:70`), `getLicenseById`
(`:81`), `removeLicense` (`:138`) e suas gêmeas de certificação **não têm try/catch**. Metade dos
métodos lança `OperatorDocumentServiceError`, a outra metade deixa vazar `AxiosError` cru. Quem chama
não consegue tratar erro de forma uniforme.

**3. Erros carregam `code` + `status`, não texto de UI.** Hoje as classes de erro guardam mensagens em
português já traduzidas — copy de interface dentro da camada de infraestrutura, uma violação de
camada. E não resolve nada: as páginas continuam reinterpretando o erro do axios por conta própria,
como em `DashboardLocador.tsx:420-433`.

## 3.6 zod como Anti-Corruption Layer

`zod` já está no `package.json` e nunca foi importado. Usá-lo não adiciona dependência.

O papel dele é validar a resposta da API **na fronteira**, em `infrastructure/schemas.ts`, e o mapper
converte o DTO validado em entidade de domínio. Dois ganhos:

- O `snake_case` da API para de vazar para dentro do domínio.
- O tipo deixa de ser uma promessa de compilação e passa a ser verificado em runtime. Hoje um
  `OperatorLicense` é `type`, apagado na compilação: se o back-end mudar um campo, o front quebra em
  produção, não no build.

## 3.7 Divisão de componentes

**`DashboardLocador.tsx`** (2.493 linhas) → uma rota-filha por aba, cada uma com seu hook. Lógica de
mutação hoje escrita dentro de handlers JSX (`:1201-1234`, repetida em `:1357-1373` e `:1492`) vai
para os hooks.

**`CNHUpload.tsx`** (974 linhas) tem **30 chamadas de `useState`** em `:91-127`, das quais **22 são
campos de um único formulário**.
`react-hook-form` e `@hookform/resolvers` já estão instalados e nunca foram usados. Um `useForm` com
resolver zod substitui os 22 estados de campo. É a maior redução de código pelo menor esforço em
todo o front-end.

O mesmo arquivo mantém um campo composto separado por travessão — `license.birth_place.split(" – ")`
na leitura e `${birthCity} – ${birthState}` na escrita. Isso é um Value Object (`BirthPlace`) pedindo
para existir em `domain/`.

`CertificationUpload.tsx` (402 linhas) é o mesmo desenho em escala menor: uma família de copy-paste,
não uma abstração compartilhada.

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
