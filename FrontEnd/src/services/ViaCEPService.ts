export interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export async function fetchAddressByCEP(cep: string): Promise<ViaCEPResponse | null> {
  const cleanCEP = cep.replace(/\D/g, "");
  if (cleanCEP.length !== 8) {
    return null;
  }
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
    if (!response.ok) return null;
    const data: ViaCEPResponse = await response.json();
    if (data.erro) return null;
    return data;
  } catch (error) {
    console.error("Error fetching address by CEP:", error);
    return null;
  }
}

/**
 * Monta o endereço a partir da resposta do ViaCEP.
 *
 * Três granularidades, escolhidas pelo que o formulário já tem em campo próprio:
 *
 * - `"logradouro"` — só rua e bairro. Para telas que têm campos separados de
 *   Cidade e Estado: repetir o município no texto do endereço criaria duas
 *   fontes para o mesmo dado, que passam a divergir assim que o usuário edita
 *   uma delas.
 * - `"completo"` — rua, bairro, município e UF. Para telas em que o endereço é
 *   o único campo de localização.
 * - `"municipio"` — só município e UF. Para a localização de um anúncio, que
 *   aparece publicamente nos cards de busca: a precisão do mapa vem do CEP
 *   guardado, não de expor a rua do maquinário a quem ainda não alugou.
 *
 * Antes cada formulário montava a sua própria string, e o mesmo CEP virava
 * endereços diferentes conforme a tela.
 */
export function formatAddressFromCEP(
  data: ViaCEPResponse,
  granularidade: "logradouro" | "completo" | "municipio" = "completo",
): string {
  const partes = {
    logradouro: [data.logradouro, data.bairro],
    completo: [data.logradouro, data.bairro, data.localidade, data.uf],
    municipio: [data.localidade, data.uf],
  }[granularidade];
  return partes.filter(Boolean).join(", ");
}
