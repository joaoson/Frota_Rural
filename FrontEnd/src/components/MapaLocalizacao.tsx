import { useEffect, useRef, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import {
  geocodificarLocal,
  urlMapaCompleto,
  urlTile,
  coordenadasParaTile,
  type Coordenadas,
} from "@/services/GeocodingService";

interface MapaLocalizacaoProps {
  /** Endereço a exibir. Costuma vir do campo de localização ou do CEP. */
  endereco: string | null | undefined;
  /** CEP do mesmo local, quando houver: leva a um ponto mais preciso. */
  cep?: string | null;
  /**
   * Coordenadas já conhecidas do local (as gravadas no anúncio, por exemplo).
   * Havendo-as, o mapa as usa direto e não consulta o Nominatim — quem edita o
   * endereço deve zerá-las para que a busca volte a acontecer.
   */
  coordenadas?: Coordenadas | null;
  /** Avisa o resultado da geocodificação, para que o formulário possa gravá-lo. */
  onCoordenadas?: (coordenadas: Coordenadas | null) => void;
  /** Altura do mapa em classe Tailwind (padrão `h-48`, a do antigo placeholder). */
  altura?: string;
  /** Nível de zoom: 13 mostra a cidade, 15 o bairro. */
  zoom?: number;
  /** Texto mostrado enquanto nenhum endereço foi informado. */
  mensagemVazia?: string;
  className?: string;
}

/** Desfecho de uma consulta ao serviço de geocodificação. */
type Resolucao =
  | { tipo: "ok"; coordenadas: Coordenadas }
  | { tipo: "nao_encontrado" }
  | { tipo: "erro" };

type Estado = Resolucao | { tipo: "vazio" } | { tipo: "carregando" };

/** Espera o usuário parar de digitar antes de consultar o serviço de geocodificação. */
const ATRASO_DIGITACAO_MS = 700;

/** Lado do tile servido pelo OpenStreetMap, em pixels. */
const LADO_TILE = 256;

function Moldura({
  altura,
  className,
  children,
}: {
  altura: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-surface-container-high rounded-xl ${altura} flex flex-col items-center justify-center gap-1.5 text-on-surface-variant text-sm border border-outline-variant/20 overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Mosaico de tiles do OpenStreetMap centrado no ponto.
 *
 * Montamos os tiles como `<img>` em vez de usar o mapa embutido do OSM
 * (`export/embed.html`): aquele iframe depende do JavaScript deles, que hoje
 * entrega o marcador mas não desenha as tiles. Aqui a imagem é servida direto
 * pelo CDN de tiles, sem script de terceiros e sem iframe.
 */
function MosaicoTiles({ coordenadas, zoom }: { coordenadas: Coordenadas; zoom: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null);

  // Quantas tiles cobrem o mapa depende do tamanho renderizado, que é fluido.
  useEffect(() => {
    const elemento = containerRef.current;
    if (!elemento) return;
    const observer = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect;
      setTamanho({ largura: width, altura: height });
    });
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);

  const centro = coordenadasParaTile(coordenadas, zoom);
  const totalTiles = 2 ** zoom;

  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  if (tamanho) {
    const meiaLargura = tamanho.largura / 2;
    const meiaAltura = tamanho.altura / 2;
    const primeiroX = Math.floor(centro.x - meiaLargura / LADO_TILE);
    const ultimoX = Math.floor(centro.x + meiaLargura / LADO_TILE);
    const primeiroY = Math.floor(centro.y - meiaAltura / LADO_TILE);
    const ultimoY = Math.floor(centro.y + meiaAltura / LADO_TILE);

    for (let x = primeiroX; x <= ultimoX; x++) {
      for (let y = primeiroY; y <= ultimoY; y++) {
        // Fora dos polos não existe tile; na horizontal o mundo dá a volta.
        if (y < 0 || y >= totalTiles) continue;
        tiles.push({
          x: ((x % totalTiles) + totalTiles) % totalTiles,
          y,
          left: meiaLargura + (x - centro.x) * LADO_TILE,
          top: meiaAltura + (y - centro.y) * LADO_TILE,
        });
      }
    }
  }

  return (
    <div ref={containerRef} className="absolute inset-0 bg-surface-container-high overflow-hidden">
      {tiles.map((tile) => (
        <img
          key={`${tile.x}/${tile.y}`}
          src={urlTile(tile.x, tile.y, zoom)}
          alt=""
          aria-hidden
          width={LADO_TILE}
          height={LADO_TILE}
          loading="lazy"
          className="absolute max-w-none select-none"
          style={{ left: `${tile.left}px`, top: `${tile.top}px` }}
        />
      ))}
      {/* O ponto fica no centro exato, que é onde o mosaico foi centrado. */}
      {tamanho && (
        <MaterialIcon
          icon="location_on"
          size={36}
          filled
          className="absolute text-primary drop-shadow-md pointer-events-none"
          style={{ left: "50%", top: "50%", transform: "translate(-50%, -100%)" }}
        />
      )}
    </div>
  );
}

/**
 * Pré-visualização da localização em mapa.
 *
 * Substitui o antigo bloco cinza "Mapa de seleção de localização": mostra de
 * fato onde fica o endereço digitado, para o locador conferir antes de publicar
 * e para o locatário saber a que distância está o maquinário.
 *
 * É uma pré-visualização, não um seletor — o endereço continua vindo do CEP ou
 * do campo de texto, e o mapa apenas confirma o que foi informado.
 */
export default function MapaLocalizacao({
  endereco,
  cep,
  coordenadas: coordenadasGravadas = null,
  onCoordenadas,
  altura = "h-48",
  zoom = 13,
  mensagemVazia = "Informe o CEP ou a localização para ver o mapa",
  className = "",
}: MapaLocalizacaoProps) {
  // Guardamos o endereço junto do desfecho: assim um resultado antigo nunca é
  // exibido sob um endereço novo — enquanto a nova consulta não chega, a tela
  // mostra "carregando" em vez do ponto anterior.
  const [resultado, setResultado] = useState<{ consulta: string; resolucao: Resolucao } | null>(
    null,
  );
  const textoEndereco = (endereco ?? "").trim();
  const digitosCep = (cep ?? "").replace(/\D/g, "");
  // Uma chave só para os dois campos: qualquer mudança dispara nova consulta,
  // e o resultado guardado sabe a qual par (CEP, endereço) ele pertence.
  const consulta = `${digitosCep}|${textoEndereco}`;
  const temAlgoParaBuscar = digitosCep.length === 8 || textoEndereco.length >= 3;
  const precisaBuscar = !coordenadasGravadas && temAlgoParaBuscar;

  useEffect(() => {
    if (!precisaBuscar) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      geocodificarLocal({ endereco: textoEndereco, cep: digitosCep }, controller.signal)
        .then((coordenadas) => {
          setResultado({
            consulta,
            resolucao: coordenadas ? { tipo: "ok", coordenadas } : { tipo: "nao_encontrado" },
          });
          onCoordenadas?.(coordenadas);
        })
        .catch((erro) => {
          // Uma consulta cancelada foi substituída por outra: não é falha.
          if (controller.signal.aborted) return;
          console.error("Erro ao localizar o endereço no mapa:", erro);
          setResultado({ consulta, resolucao: { tipo: "erro" } });
        });
    }, ATRASO_DIGITACAO_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [consulta, precisaBuscar, textoEndereco, digitosCep, onCoordenadas]);

  const estado: Estado = coordenadasGravadas
    ? { tipo: "ok", coordenadas: coordenadasGravadas }
    : !temAlgoParaBuscar
      ? { tipo: "vazio" }
      : resultado?.consulta === consulta
        ? resultado.resolucao
        : { tipo: "carregando" };

  if (estado.tipo === "vazio") {
    return (
      <Moldura altura={altura} className={className}>
        <MaterialIcon icon="map" size={24} className="text-outline" />
        <span className="text-xs px-4 text-center">{mensagemVazia}</span>
      </Moldura>
    );
  }

  if (estado.tipo === "carregando") {
    return (
      <Moldura altura={altura} className={className}>
        <MaterialIcon icon="travel_explore" size={24} className="text-outline animate-pulse" />
        <span className="text-xs px-4 text-center">Localizando no mapa...</span>
      </Moldura>
    );
  }

  if (estado.tipo === "nao_encontrado" || estado.tipo === "erro") {
    return (
      <Moldura altura={altura} className={className}>
        <MaterialIcon icon="location_off" size={24} className="text-outline" />
        <span className="text-xs px-4 text-center">
          {estado.tipo === "nao_encontrado"
            ? "Não localizamos este endereço no mapa. Confira o CEP ou a cidade."
            : "Não foi possível carregar o mapa agora."}
        </span>
      </Moldura>
    );
  }

  const { coordenadas } = estado;
  return (
    <div
      className={`relative rounded-xl ${altura} overflow-hidden border border-outline-variant/20 ${className}`}
    >
      <MosaicoTiles coordenadas={coordenadas} zoom={zoom} />

      <div className="absolute bottom-0 inset-x-0 bg-surface-container-lowest/95 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-3 border-t border-outline-variant/20">
        <span className="text-[11px] text-on-surface-variant truncate flex items-center gap-1 min-w-0">
          <MaterialIcon icon="location_on" size={14} className="text-primary shrink-0" />
          <span className="truncate">{coordenadas.nomeExibicao}</span>
        </span>
        <a
          href={urlMapaCompleto(coordenadas, zoom)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-bold text-primary hover:underline shrink-0 flex items-center gap-0.5"
        >
          Ampliar <MaterialIcon icon="open_in_new" size={12} />
        </a>
      </div>

      {/* Atribuição exigida pela licença dos dados do OpenStreetMap. */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-1 right-1 bg-surface-container-lowest/80 rounded px-1.5 py-0.5 text-[9px] text-on-surface-variant hover:text-primary"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}
