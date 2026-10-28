# Seletor compartilhado; salvar pelo repository do modelo

Pré-requisito: catálogo do [guia 01](01_api_services_e_rotas.md) retorna `{id, nome}`. Os caminhos são relativos à raiz do projeto.

## 1 Criar o hook do catálogo

Arquivo novo completo: `FrontEnd/src/features/autoria/useCategorias.ts`.

<!-- file: FrontEnd/src/features/autoria/useCategorias.ts -->

```ts
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { httpClient } from "@/app/container";

const categoriasSchema = z.array(z.object({
  id: z.string().uuid(),
  nome: z.string(),
}));

export function useCategorias() {
  return useQuery({
    queryKey: ["autoria", "categorias"],
    queryFn: async () => {
      const response = await httpClient.send<unknown>({
        method: "GET", path: "autoria/categorias",
      });
      return categoriasSchema.parse(response.data);
    },
    staleTime: 60_000,
  });
}
```

O `httpClient` existente já trata token, renovação da sessão e URL base.

## 2 Criar o componente

Arquivo novo completo: `FrontEnd/src/features/autoria/CategoriaSelect.tsx`.

<!-- file: FrontEnd/src/features/autoria/CategoriaSelect.tsx -->

```tsx
import { useId } from "react";
import { useCategorias } from "./useCategorias";

interface Props {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  disabled?: boolean;
}

export function CategoriaSelect({ value, onChange, label = "Categoria", disabled }: Props) {
  const id = useId();
  const query = useCategorias();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || query.isPending || query.isError}
        className="w-full rounded-lg border p-3 bg-surface-container text-on-surface"
      >
        <option value="">{query.isPending ? "Carregando…" : "Não informado"}</option>
        {query.data?.map((categoria) => (
          <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
        ))}
      </select>
      {query.isError && <p role="alert">Não foi possível carregar as opções.</p>}
    </div>
  );
}
```

## 3 Contrato de dados no fluxo existente

Aplicar estes trechos nos arquivos/classes exatos indicados no guia de cada modelo. Não substituir objetos inteiros pelos trechos.

```ts
// Dentro do schema Zod de RESPOSTA:
categoria_autoria: z.string().uuid().nullish(),
categoria_nome: z.string().nullish(),

// Dentro da interface de domínio (opcionais para fixtures antigas):
categoriaAutoriaId?: string | null;
categoriaNome?: string | null;

// Dentro do objeto retornado pelo mapper; dto = argumento real do mapper:
categoriaAutoriaId: dto.categoria_autoria ?? null,
categoriaNome: dto.categoria_nome ?? null,

// Dentro do tipo/schema de ENTRADA, se for editável:
// interface:
categoria_autoria?: string | null;
// OU schema Zod:
categoria_autoria: z.string().uuid().nullable().optional(),
```

Se o mapper monta o payload explicitamente, acrescentar também `categoria_autoria` nesse objeto. Adicionar só na interface não transmite o campo.

## 4 Formulário existente

```tsx
import { CategoriaSelect } from "@/features/autoria/CategoriaSelect";

// Estado do formulário, inicializado com o registro carregado:
const [categoriaId, setCategoriaId] = useState("");
// No bloco existente que carrega os campos do registro:
setCategoriaId(registro.categoriaAutoriaId ?? "");

// Dentro do formulário, antes do botão de salvar:
<CategoriaSelect value={categoriaId} onChange={setCategoriaId} />

// Dentro do payload enviado pela mutation EXISTENTE:
categoria_autoria: categoriaId || null,

// Na leitura da resposta/consulta após salvar; não usar categoriaId aqui:
<p>Salvo no banco: {registro.categoriaNome ?? "Não informado"}</p>
```

`registro` acima é uma indicação do padrão, não uma variável global. O [guia de usuários](04_usuarios_pelo_fluxo_existente.md) contém o código com `user`, `formCategoriaId` e a mutation reais.

## 5 Verificação

```bash
# Terminal na raiz
cd FrontEnd
npx tsc -b
npm run lint
```

Depois de salvar, a mutation deve invalidar/atualizar a consulta existente. Recarregar a página e conferir o texto vindo da API. Não criar outra página `/autoria/:recurso/:id` para contornar o formulário real.
