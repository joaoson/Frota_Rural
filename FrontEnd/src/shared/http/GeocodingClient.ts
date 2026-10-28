/**
 * Geocodificação de endereços via Nominatim (OpenStreetMap).
 *
 * Escolhido pelo mesmo motivo do ViaCEP: é público e não exige chave de API,
 * então o mapa funciona em qualquer ambiente sem configuração. Em troca, a
 * política de uso do serviço pede no máximo uma consulta por segundo — por isso
 * quem chama deve esperar o usuário parar de digitar (ver `MapaLocalizacao`).
 */

export interface Coordenadas {
  lat: number;
  lon: number;
  /** Endereço como o Nominatim o reconheceu, útil para confirmar o acerto. */
  nomeExibicao: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Consultas repetidas de um mesmo local não voltam à rede. */
const cache = new Map<string, Coordenadas | null>();

async function consultar(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<Coordenadas | null> {
  const query = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    // O cadastro é de maquinário agrícola no Brasil; restringir o país evita
    // que "Palmeiras, SP" caia em uma cidade homônima de outro continente.
    countrycodes: "br",
    "accept-language": "pt-BR",
    ...params,
  });

  const resposta = await fetch(`${NOMINATIM_URL}?${query}`, { signal });
  if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);

  const dados: { lat: string; lon: string; display_name: string }[] = await resposta.json();
  const primeiro = dados[0];
  if (!primeiro) return null;
  return {
    lat: Number(primeiro.lat),
    lon: Number(primeiro.lon),
    nomeExibicao: primeiro.display_name,
  };
}

/**
 * Converte um local em coordenadas. Devolve `null` quando nada é reconhecido —
 * o mapa então mostra o aviso, em vez de apontar para o lugar errado.
 *
 * Havendo CEP, ele é tentado primeiro: leva ao bairro, enquanto o endereço
 * livre do cadastro costuma ser só "Cidade, UF" e cai no centro do município.
 * Se o CEP não for reconhecido, a busca cai no endereço.
 *
 * @param signal permite cancelar a consulta quando o local muda no meio dela.
 */
export async function geocodificarLocal(
  { endereco, cep }: { endereco?: string | null; cep?: string | null },
  signal?: AbortSignal,
): Promise<Coordenadas | null> {
  const textoEndereco = (endereco ?? "").trim();
  const digitosCep = (cep ?? "").replace(/\D/g, "");
  const cepValido = digitosCep.length === 8 ? digitosCep : "";

  if (!cepValido && textoEndereco.length < 3) return null;

  const chave = `${cepValido}|${textoEndereco.toLowerCase()}`;
  const emCache = cache.get(chave);
  if (emCache !== undefined) return emCache;

  let resultado: Coordenadas | null = null;
  if (cepValido) {
    resultado = await consultar({ postalcode: cepValido }, signal);
  }
  if (!resultado && textoEndereco.length >= 3) {
    resultado = await consultar({ q: textoEndereco }, signal);
  }

  cache.set(chave, resultado);
  return resultado;
}

/**
 * Posição do ponto na grade de tiles do zoom informado (projeção Web Mercator).
 *
 * O valor é fracionário de propósito: a parte inteira diz qual tile contém o
 * ponto, e a fracionária onde ele cai dentro dela — é o que permite centralizar
 * o mosaico exatamente no endereço, e não no canto de uma tile.
 */
export function coordenadasParaTile({ lat, lon }: Coordenadas, zoom: number) {
  const totalTiles = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * totalTiles,
    y:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      totalTiles,
  };
}

/** URL da tile de mapa do OpenStreetMap. O uso exige exibir a atribuição. */
export function urlTile(x: number, y: number, zoom: number): string {
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

/** Link para abrir o mesmo ponto no site do OpenStreetMap, em tela cheia. */
export function urlMapaCompleto({ lat, lon }: Coordenadas, zoom = 13): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}
