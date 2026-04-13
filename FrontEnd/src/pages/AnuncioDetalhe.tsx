import { useState, useEffect } from "react";
import { Link, useParams } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { postingService } from "@/services/PostingService/PostingService";

const FALLBACK_IMG = "https://placehold.co/800x600/e8e0d0/2D3F1E?text=Sem+foto";

interface FotoAPI {
  url: string;
  is_primary: boolean | null;
}

interface PostingDetalheAPI {
  id: string;
  hourly_rate: string;
  location_address: string | null;
  availability_start: string | null;
  availability_end: string | null;
  description: string | null;
  status: string | null;
  machine_brand: string | null;
  machine_model: string | null;
  machine_year: number | null;
  machine_usage_purpose: string | null;
  machine_technical_specifications: string | null;
  machine_renagro_number: string | null;
  photos: FotoAPI[];
}

// Estrelas SVG com preenchimento parcial via linearGradient
const CAMINHO_ESTRELA = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";
const COR_CHEIA  = "hsl(39,99%,60%)";
const COR_VAZIA  = "hsl(100,8%,80%)";

function EstrelasPorNota({ nota, total }: { nota: number; total: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: total }).map((_, indice) => {
        const fracao = Math.min(1, Math.max(0, nota - indice));
        const gradId = `star-grad-${indice}`;

        return (
          <svg key={indice} width="16" height="16" viewBox="0 0 24 24">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset={`${fracao * 100}%`} stopColor={COR_CHEIA} />
                <stop offset={`${fracao * 100}%`} stopColor={COR_VAZIA} />
              </linearGradient>
            </defs>
            <path d={CAMINHO_ESTRELA} fill={`url(#${gradId})`} />
          </svg>
        );
      })}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function ordenarFotos(fotos: FotoAPI[]): FotoAPI[] {
  return [...fotos].sort((fotoA, fotoB) => {
    if (fotoA.is_primary && !fotoB.is_primary) return -1;
    if (!fotoA.is_primary && fotoB.is_primary) return 1;
    return 0;
  });
}

const AnuncioDetalhe = () => {
  const { id } = useParams<{ id: string }>();

  const [anuncio, setAnuncio]                 = useState<PostingDetalheAPI | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [erro, setErro]                       = useState<string | null>(null);
  const [fotoSelecionada, setFotoSelecionada] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!id) return;
    setLoading(true);
    postingService
      .getById(id)
      .then((data: PostingDetalheAPI) => {
        setAnuncio(data);
        setLoading(false);
      })
      .catch((erro: unknown) => {
        console.error(erro);
        setErro("Não foi possível carregar o anúncio.");
        setLoading(false);
      });
  }, [id]);

  const fotos        = anuncio ? ordenarFotos(anuncio.photos) : [];
  const urlFotoAtual = fotos[fotoSelecionada]?.url ?? FALLBACK_IMG;
  const titulo       = [anuncio?.machine_brand, anuncio?.machine_model].filter(Boolean).join(" ") || "Sem título";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 pt-32 pb-20 max-w-[1200px] mx-auto px-6 w-full">

        <Link
          to="/buscar-maquinario"
          className="text-sm font-bold text-primary hover:underline mb-8 inline-flex items-center gap-1"
        >
          <MaterialIcon icon="arrow_back" size={16} /> Voltar à busca
        </Link>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <p className="text-on-surface-variant text-sm">Carregando anúncio...</p>
          </div>
        )}

        {/* Erro */}
        {!loading && erro && (
          <div className="text-center py-20 bg-error-container rounded-2xl border border-error/20">
            <p className="text-error font-bold mb-2">Erro ao carregar</p>
            <p className="text-on-surface-variant text-sm">{erro}</p>
          </div>
        )}

        {/* Conteúdo principal */}
        {!loading && !erro && anuncio && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

            {/* ── Galeria ── */}
            <div className="lg:col-span-3 space-y-4">

              {/* Foto principal */}
              <div className="rounded-2xl overflow-hidden bg-surface-container-high h-[420px] shadow-sm relative group">
                <img
                  src={urlFotoAtual}
                  alt={titulo}
                  className="w-full h-full object-cover"
                  onError={(evento) => { evento.currentTarget.src = FALLBACK_IMG; }}
                />
                {fotos.length > 1 && (
                  <>
                    <button
                      onClick={() => setFotoSelecionada((prev) => (prev === 0 ? fotos.length - 1 : prev - 1))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-surface-container-lowest/80 rounded-full flex items-center justify-center shadow hover:bg-surface-container-lowest transition opacity-0 group-hover:opacity-100"
                    >
                      <MaterialIcon icon="chevron_left" size={20} className="text-primary" />
                    </button>
                    <button
                      onClick={() => setFotoSelecionada((prev) => (prev === fotos.length - 1 ? 0 : prev + 1))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-surface-container-lowest/80 rounded-full flex items-center justify-center shadow hover:bg-surface-container-lowest transition opacity-0 group-hover:opacity-100"
                    >
                      <MaterialIcon icon="chevron_right" size={20} className="text-primary" />
                    </button>
                  </>
                )}
              </div>

              {/* Miniaturas */}
              {fotos.length > 1 && (
                <div className="grid grid-cols-3 gap-3">
                  {fotos.map((foto, indice) => (
                    <button
                      key={indice}
                      onClick={() => setFotoSelecionada(indice)}
                      className={`rounded-xl overflow-hidden h-24 bg-surface-container-high cursor-pointer hover:opacity-80 transition-all border-2 ${
                        indice === fotoSelecionada
                          ? "border-primary shadow-md"
                          : "border-outline-variant/20"
                      }`}
                    >
                      <img
                        src={foto.url}
                        alt={`Foto ${indice + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(evento) => { evento.currentTarget.src = FALLBACK_IMG; }}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Descrição */}
              {anuncio.description && (
                <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/20">
                  <div className="text-[10px] uppercase font-bold text-outline tracking-widest mb-2">Descrição</div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{anuncio.description}</p>
                </div>
              )}
            </div>

            {/* ── Detalhes ── */}
            <div className="lg:col-span-2 space-y-8">

              {/* Cabeçalho */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-3 py-1 bg-primary/10 text-primary font-bold text-[10px] rounded uppercase tracking-widest border border-primary/20 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Disponível
                  </span>
                </div>
                <h1 className="font-headline text-3xl font-bold text-primary mb-2">{titulo}</h1>
                <div className="h-1 w-16 bg-secondary-container mb-3" />
                {anuncio.location_address && (
                  <p className="text-on-surface-variant flex items-center gap-1 text-sm">
                    <MaterialIcon icon="location_on" size={16} /> {anuncio.location_address}
                  </p>
                )}
              </div>

              {/* Especificações */}
              <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/20">
                <div className="grid grid-cols-2 gap-5">
                  {[
                    { label: "Marca / Modelo",  valor: [anuncio.machine_brand, anuncio.machine_model].filter(Boolean).join(" ") || null },
                    { label: "Ano",              valor: anuncio.machine_year ? String(anuncio.machine_year) : null },
                    { label: "Atividade",        valor: anuncio.machine_usage_purpose },
                    { label: "Nº Renagro",       valor: anuncio.machine_renagro_number },
                    { label: "Disponível de",    valor: formatDate(anuncio.availability_start) },
                    { label: "Disponível até",   valor: formatDate(anuncio.availability_end) },
                  ].map((item) =>
                    item.valor ? (
                      <div key={item.label}>
                        <div className="text-[10px] uppercase font-bold text-outline tracking-widest mb-1">{item.label}</div>
                        <div className="font-bold text-tertiary text-sm">{item.valor}</div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>

              {/* Especificações técnicas */}
              {anuncio.machine_technical_specifications && (
                <div>
                  <div className="text-[10px] uppercase font-bold text-outline tracking-widest mb-2">Especificações Técnicas</div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    {anuncio.machine_technical_specifications}
                  </p>
                </div>
              )}

              {/* Selo: Operador verificado */}
              <div className="bg-primary/5 border border-primary/20 p-5 rounded-xl flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <MaterialIcon icon="verified_user" className="text-primary" size={22} />
                </div>
                <div>
                  <div className="font-bold text-primary text-sm">Operador com NR-31 Verificado</div>
                  <div className="text-[11px] text-on-surface-variant">Credencial validada pelo sistema Confia Rural</div>
                </div>
              </div>

              {/* Avaliações do locador */}
              <div className="border-t border-outline-variant/20 pt-5">
                <div className="text-[10px] uppercase font-bold text-outline tracking-widest mb-2">Avaliações do Locador</div>
                <div className="flex items-center gap-2">
                  <EstrelasPorNota nota={4.8} total={5} />
                  <span className="font-bold text-tertiary text-sm">4.8 (12 avaliações)</span>
                </div>
              </div>

              {/* CTA — Preço + botões */}
              <div className="bg-[hsl(45,40%,93%)] p-6 rounded-xl border border-outline-variant/20">
                <div className="mb-5">
                  <span className="text-[10px] text-outline font-bold uppercase tracking-widest block mb-1">Custo por Hora</span>
                  <div className="text-4xl font-black text-primary">
                    R$ {parseFloat(anuncio.hourly_rate).toFixed(2)}
                    <span className="text-sm font-bold text-tertiary">/hora</span>
                  </div>
                </div>

                {/* Botão: Solicitar Reserva */}
                <Link
                  to={`/reservar/${anuncio.id}`}
                  className="block w-full bg-gradient-to-r from-primary to-primary-container text-on-primary py-4 rounded-lg font-bold text-center hover:shadow-lg transition-all shadow-md text-lg mb-3"
                >
                  Solicitar Reserva
                </Link>

                {/* Botão: Conversar com Locador */}
                <Link
                  to={`/chat/${anuncio.id}`}
                  className="flex items-center justify-center gap-2 w-full border-2 border-primary text-primary py-3.5 rounded-lg font-bold text-base hover:bg-primary/5 transition-colors"
                >
                  <MaterialIcon icon="chat" size={20} />
                  Conversar com o Locador
                </Link>
              </div>

            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default AnuncioDetalhe;
