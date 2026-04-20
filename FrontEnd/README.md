# FrontEnd — Setup

**Resumo**

Este documento descreve o setup mínimo para rodar o FrontEnd do projeto (Vite + React).

**Requisitos mínimos**

- Node: 20+
- npm: 10+

**Dependências importantes instaladas**

- `shadcn` — biblioteca de componentes/estilos usada no projeto
- `tailwindcss` — framework de utilitários CSS
- `axios` — para requisições HTTP
- `zod` — validação de formulários

**Como executar o projeto**

1. Abra um terminal e entre na pasta do frontend:

```bash
cd FrontEnd
```

2. Instale as dependências definidas no `package.json`:

```bash
npm i
```

3. Rode o servidor de desenvolvimento (Vite):

```bash
npm run dev
```

4. Verifique versões, se necessário:

```bash
node -v
npm -v
```

Observações:

- O comando `npm i` baixa todas as dependências listadas em `FrontEnd/package.json`.
- O projeto está configurado com Vite + React; o TailwindCSS e `shadcn` já estão integrados como dependências.

**Estrutura de pastas**

| Caminho / Item     | Descrição                                          |
| ------------------ | -------------------------------------------------- |
| src/               | Código-fonte da aplicação                          |
| src/assets/        | Arquivos estáticos, como imagens, sons, logos etc. |
| src/components/    | Componentes reutilizáveis                          |
| src/components/ui/ | Componentes shadcn (gerados automaticamente)       |
| src/pages/         | Páginas / rotas                                    |
| src/hooks/         | Custom hooks (ex: useAuth)                         |
| src/lib/           | Utilitários (api.ts, utils.ts)                     |
| src/services/      | Chamadas de API organizadas por domínio            |
| src/types/         | Tipagens TypeScript                                |
| src/routes/        | Configuração das rotas                             |
| src/App.tsx        | Componente principal (pode ficar em `src/`)        |
| src/main.tsx       | Ponto de entrada (Vite)                            |
