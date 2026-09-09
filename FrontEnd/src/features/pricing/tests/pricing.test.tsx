import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { HttpPricingRepository } from "../api/PricingRepository";
import { PricingStore } from "../api/PricingStore";
import { usePricingSuggestion } from "../hooks/usePricingSuggestion";
import type { PricingSuggestion } from "../types/pricing";
import type { HttpClient } from "@/shared/http/HttpClient";

const { suggest } = vi.hoisted(() => ({ suggest: vi.fn() }));
vi.mock("@/app/container", () => ({ pricingStore: { suggest } }));

afterEach(() => { cleanup(); suggest.mockReset(); });

const fixture: PricingSuggestion = {
  suggestion_id: "suggestion-a", sugerido_brl_hora: "192.15",
  faixa_brl_hora: ["172.94", "211.37"], custo_brl_hora: "160.13",
  locatario_paga_brl_hora: "211.37", equivalente_diaria_brl: "1537.20",
  composicao: [{ chave: "capital", item: "Capital", brl_hora: "40.00" }],
  premissas: {
    categoria: "trator", idade_anos: 7, horimetro: 4900, horimetro_declarado: true,
    potencia_cv: 110, valor_mercado_usado_brl: 380000, valor_novo_equivalente_brl: 620000,
    horas_faturaveis_ano: 528, horas_motor_ano: 343, comparaveis_internos: 0,
    tarifas_mercado_encontradas: 0, inclui_combustivel: false, inclui_operador: false,
    custo_antes_da_ancoragem: "192.15",
  },
  fontes: [{ url: "https://example.com/tractor", title: "Trator" }],
  confianca: "alta", origem: "pesquisa", versao_parametros: "v1",
};

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("pricing through the new architecture", () => {
  it("sends the machine and validates the real response shape through store/repository/client", async () => {
    const send = vi.fn().mockResolvedValue({ status: 200, data: fixture });
    const store = new PricingStore(new HttpPricingRepository({ send } as HttpClient));
    expect(await store.suggest({ machinery: "machine-a" })).toEqual(fixture);
    expect(send).toHaveBeenCalledWith({ method: "POST", path: "pricing/suggest", body: { machinery: "machine-a" } });
    send.mockResolvedValue({ status: 200, data: { ...fixture, sugerido_brl_hora: "invalid" } });
    await expect(store.suggest({ machinery: "machine-a" })).rejects.toThrow();
  });

  it("requests only on user action and clears a completed suggestion on machine change", async () => {
    suggest.mockResolvedValue(fixture);
    const { result, rerender } = renderHook(({ machine }) => usePricingSuggestion(machine), {
      initialProps: { machine: "machine-a" }, wrapper,
    });
    expect(suggest).not.toHaveBeenCalled();
    act(() => result.current.request());
    await waitFor(() => expect(result.current.suggestion).toEqual(fixture));
    rerender({ machine: "machine-b" });
    expect(result.current.suggestion).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it("ignores a late response after A → B → A, even while a fresh request is pending", async () => {
    const old = deferred<PricingSuggestion>();
    const fresh = deferred<PricingSuggestion>();
    suggest.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result, rerender } = renderHook(({ machine }) => usePricingSuggestion(machine), {
      initialProps: { machine: "machine-a" }, wrapper,
    });
    act(() => result.current.request());
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
    rerender({ machine: "machine-b" });
    rerender({ machine: "machine-a" });
    act(() => result.current.request());
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve(fixture));
    expect(result.current.suggestion).toBeNull();
    await act(async () => fresh.resolve({ ...fixture, suggestion_id: "fresh" }));
    await waitFor(() => expect(result.current.suggestion?.suggestion_id).toBe("fresh"));
    act(() => result.current.dismiss());
    expect(result.current.suggestion).toBeNull();
    expect(result.current.suggestionId).toBe("fresh");
  });

  it("does not retry an unavailable market suggestion and permits a later manual retry", async () => {
    suggest.mockRejectedValueOnce(new Error("Sem dados confiáveis")).mockResolvedValueOnce(fixture);
    const { result } = renderHook(() => usePricingSuggestion("machine-a"), { wrapper });
    act(() => result.current.request());
    await waitFor(() => expect(result.current.error?.message).toBe("Sem dados confiáveis"));
    expect(suggest).toHaveBeenCalledTimes(1);
    act(() => result.current.request());
    await waitFor(() => expect(result.current.suggestion).toEqual(fixture));
  });
});
