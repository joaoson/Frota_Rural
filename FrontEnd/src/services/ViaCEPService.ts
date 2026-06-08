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
