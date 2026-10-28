# Frontend com carregamento gravação e leitura

Arquivos completos. A base HTTP já contém `/api`; os paths abaixo começam em `autoria/`.

Use `http://localhost:5183`, conectado à API `http://localhost:8010/api`. Os caminhos abaixo são relativos à raiz do repositório. Para reiniciar o Vite com essa conexão, consulte o [guia do ambiente](05_ambiente_dev_e_banco_isolado.md).

## Tipos e validação

<!-- file: FrontEnd/src/features/autoria/types/autoria.ts -->
```typescript
import { z } from "zod";

export const categoriaSchema = z.object({ id: z.string().uuid(), nome: z.string() });
export const categoriasSchema = z.array(categoriaSchema);
export const vinculoSchema = z.object({
  id: z.string(), // PaymentEvents usa ID textual; os demais usam UUID.
  categoria_id: z.string().uuid().nullable(),
  categoria_nome: z.string().nullable(),
});
export type Categoria = z.infer<typeof categoriaSchema>;
export type Vinculo = z.infer<typeof vinculoSchema>;
```

## Repository

<!-- file: FrontEnd/src/features/autoria/api/AutoriaRepository.ts -->
```typescript
import type { HttpClient } from "@/shared/http/HttpClient";
import { categoriasSchema, vinculoSchema } from "../types/autoria";

export class AutoriaRepository {
  private readonly http: HttpClient;
  constructor(http: HttpClient) { this.http = http; }

  async categorias() {
    const response = await this.http.send<unknown>({ method: "GET", path: "autoria/categorias" });
    return categoriasSchema.parse(response.data);
  }

  async obter(recurso: string, id: string) {
    const response = await this.http.send<unknown>({
      method: "GET", path: `autoria/${encodeURIComponent(recurso)}/${encodeURIComponent(id)}`,
    });
    return vinculoSchema.parse(response.data);
  }

  async salvar(recurso: string, id: string, categoriaId: string) {
    const response = await this.http.send<unknown>({
      method: "PATCH", path: `autoria/${encodeURIComponent(recurso)}/${encodeURIComponent(id)}`,
      body: { categoria_id: categoriaId },
    });
    return vinculoSchema.parse(response.data);
  }
}
```

## Store e chave de cache

<!-- file: FrontEnd/src/features/autoria/api/AutoriaStore.ts -->
```typescript
import type { QueryClient } from "@tanstack/react-query";
import type { AutoriaRepository } from "./AutoriaRepository";

export class AutoriaStore {
  private readonly repository: AutoriaRepository;
  private readonly queryClient: QueryClient;
  constructor(repository: AutoriaRepository, queryClient: QueryClient) {
    this.repository = repository;
    this.queryClient = queryClient;
  }
  categoriasOptions() {
    return { queryKey: ["autoria", "categorias"] as const,
      queryFn: () => this.repository.categorias() };
  }
  registroOptions(recurso: string, id: string) {
    return { queryKey: ["autoria", recurso, id] as const,
      queryFn: () => this.repository.obter(recurso, id) };
  }
  async salvar(recurso: string, id: string, categoriaId: string) {
    await this.repository.salvar(recurso, id, categoriaId);
    // Faz GET novamente: a exibição usa a resposta persistida do servidor.
    await this.queryClient.invalidateQueries({ queryKey: ["autoria", recurso, id] });
  }
  clear() { this.queryClient.removeQueries({ queryKey: ["autoria"] }); }
}
```

## Registrar no container de dependências do frontend

`FrontEnd/src/app/container.ts` — acrescentar os imports:

```typescript
import { AutoriaRepository } from "@/features/autoria/api/AutoriaRepository";
import { AutoriaStore } from "@/features/autoria/api/AutoriaStore";
```

Dentro de `const stores = { ... }`:

```typescript
autoria: new AutoriaStore(new AutoriaRepository(httpClient), queryClient),
```

Dentro de `export const { ... } = stores`:

```typescript
autoria: autoriaStore,
```

## Seletor reutilizável

<!-- file: FrontEnd/src/features/autoria/components/CategoriaSelect.tsx -->
```tsx
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { autoriaStore } from "@/app/container";

interface Props { value: string; onChange: (id: string) => void; disabled?: boolean }

export function CategoriaSelect({ value, onChange, disabled = false }: Props) {
  const id = useId();
  const categorias = useQuery(autoriaStore.categoriasOptions());
  if (categorias.isPending) return <p>Carregando categorias...</p>;
  if (categorias.isError) return <p role="alert">Não foi possível carregar as categorias.</p>;
  return <div>
    <label htmlFor={id}>Categoria</label>
    <select id={id} value={value} disabled={disabled}
      onChange={(event) => onChange(event.target.value)}>
      <option value="">Selecione</option>
      {categorias.data.map((categoria) =>
        <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
    </select>
  </div>;
}
```

## Salvar e mostrar o valor do banco

<!-- file: FrontEnd/src/features/autoria/components/CategoriaEditor.tsx -->
```tsx
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { autoriaStore } from "@/app/container";
import { CategoriaSelect } from "./CategoriaSelect";

interface Props { recurso: string; id: string; somenteLeitura?: boolean }

export function CategoriaEditor({ recurso, id, somenteLeitura = false }: Props) {
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const registro = useQuery(autoriaStore.registroOptions(recurso, id));
  const salvar = useMutation({
    mutationFn: (categoriaId: string) => autoriaStore.salvar(recurso, id, categoriaId),
    onSuccess: () => setSelecionada(null),
  });
  if (registro.isPending) return <p>Carregando registro...</p>;
  if (registro.isError) return <p role="alert">{registro.error.message}</p>;
  const categoriaId = selecionada ?? registro.data.categoria_id ?? "";
  return <section className="space-y-4 rounded-xl border p-6">
    <h1>Categoria do registro</h1>
    <p>ID: {registro.data.id}</p>
    {!somenteLeitura && <>
      <CategoriaSelect value={categoriaId} onChange={setSelecionada} disabled={salvar.isPending} />
      <button type="button" disabled={!categoriaId || salvar.isPending}
        onClick={() => salvar.mutate(categoriaId)}>
        {salvar.isPending ? "Salvando..." : "Salvar categoria"}
      </button>
    </>}
    {salvar.isError && <p role="alert">{salvar.error.message}</p>}
    {salvar.isSuccess && <p role="status">Categoria salva.</p>}
    <p>Valor persistido: <output aria-label="Categoria persistida">
      {registro.data.categoria_nome ?? "Não definida"}
    </output></p>
    <button type="button" onClick={() => void registro.refetch()}>Ler novamente do banco</button>
  </section>;
}
```

## Página protegida

<!-- file: FrontEnd/src/pages/autoria/AutoriaPage.tsx -->
```tsx
import { useParams } from "react-router";
import { CategoriaEditor } from "@/features/autoria/components/CategoriaEditor";

export default function AutoriaPage() {
  const { recurso, id } = useParams();
  if (!recurso || !id) return <p role="alert">Informe recurso e ID na URL.</p>;
  const somenteLeitura = ["contract_revisions", "contract_signatures"].includes(recurso);
  return <main className="mx-auto max-w-2xl p-6">
    <CategoriaEditor key={`${recurso}:${id}`} recurso={recurso} id={id}
      somenteLeitura={somenteLeitura} />
  </main>;
}
```

`FrontEnd/src/app/routes/protectedRoutes.tsx` — acrescentar import e rota dentro do `<Route element={<ProtectedRoute />}>` externo:

```tsx
import AutoriaPage from "@/pages/autoria/AutoriaPage";

// Dentro do Route protegido existente:
<Route path="/autoria/:recurso/:id" element={<AutoriaPage />} />
```

```text
1. Faça login pelo /login. O httpClient existente envia/renova o token.
2. Abra /autoria/users/ID_REAL_DO_USUARIO.
3. Selecione uma categoria -> Salvar categoria -> F5.
4. O nome exibido deve continuar igual porque veio do GET no banco.
5. A rota de cada recurso precisa ter sido adicionada pelo guia daquele modelo.
```
