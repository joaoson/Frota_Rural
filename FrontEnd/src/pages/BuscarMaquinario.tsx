import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { Search, MapPin, CalendarDays, SlidersHorizontal, X, SearchX, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { postingService } from "@/services/PostingService/PostingService";

const ITENS_POR_PAGINA = 9;
const FALLBACK_IMG = "https://placehold.co/800x600/e8e0d0/2D3F1E?text=Sem+foto";

// Ícone de grade que representa N colunas
function IconeGrade({ n }: { n: number }) {
  const tamanho = 14;
  const espaco  = 1.5;
  const celula  = (tamanho - espaco * (n - 1)) / n;
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`}>
      {Array.from({ length: n }).flatMap((_, linha) =>
        Array.from({ length: n }).map((_, col) => (
          <rect
            key={`${linha}-${col}`}
            x={col * (celula + espaco)}
            y={linha * (celula + espaco)}
            width={celula}
            height={celula}
            fill="currentColor"
            rx={0.5}
          />
        ))
      )}
    </svg>
  );
}

// Tipo retornado pela API
interface PostingAPI {
  id: string;
  machine_brand: string | null;
  machine_model: string | null;
  machine_usage_purpose: string | null;
  machine_year: number | null;
  hourly_rate: string;
  location_address: string | null;
  availability_start: string | null;
  availability_end: string | null;
  status: string | null;
  primary_photo_url: string | null;
}

// Tipo usado no componente
interface Anuncio {
  id: string;
  imagem: string;
  titulo: string;
  cidade: string;
  preco: number;
  atividade: string;
  ano: string;
  de: string;
  ate: string;
  de_comparacao: string;
  ate_comparacao: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function mapPosting(anuncioAPI: PostingAPI): Anuncio {
  return {
    id: anuncioAPI.id,
    imagem: anuncioAPI.primary_photo_url ?? FALLBACK_IMG,
    titulo: [anuncioAPI.machine_brand, anuncioAPI.machine_model].filter(Boolean).join(" ") || "Sem título",
    cidade: anuncioAPI.location_address ?? "—",
    preco: parseFloat(anuncioAPI.hourly_rate),
    atividade: anuncioAPI.machine_usage_purpose ?? "",
    ano: anuncioAPI.machine_year ? String(anuncioAPI.machine_year) : "—",
    de: formatDate(anuncioAPI.availability_start),
    ate: formatDate(anuncioAPI.availability_end),
    de_comparacao: anuncioAPI.availability_start?.slice(0, 10) ?? "",
    ate_comparacao: anuncioAPI.availability_end?.slice(0, 10) ?? "",
  };
}

const BuscarMaquinario = () => {
  // Dados do back
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState<string | null>(null);

  // Filtros
  const [busca,       setBusca]       = useState("");
  const [atividade,   setAtividade]   = useState("");
  const [cidade,      setCidade]      = useState("");
  const [precoMax,    setPrecoMax]    = useState("");
  const [dataInicio,  setDataInicio]  = useState("");
  const [dataFim,     setDataFim]     = useState("");
  const [buscou,      setBuscou]      = useState(false);

  // Grade e ordenação
  const [colunas,   setColunas]   = useState<2 | 3>(3);
  const [ordenacao, setOrdenacao] = useState<"relevancia" | "menor_preco" | "maior_preco" | "recentes">("relevancia");

  // Paginação
  const [pagina, setPagina] = useState(1);

  const refAnuncios = useRef<HTMLDivElement>(null);

  // Scroll ao topo ao entrar na página
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Busca única ao carregar a página
  useEffect(() => {
    setLoading(true);
    postingService
      .list({ status: "active" })
      .then((data: PostingAPI[]) => {
        setAnuncios(data.map(mapPosting));
        setLoading(false);
      })
      .catch((erro: unknown) => {
        console.error(erro);
        setErro("Não foi possível carregar os anúncios. Verifique se o servidor está rodando.");
        setLoading(false);
      });
  }, []);

  // Filtragem client-side 
  const resultados = anuncios.filter((anuncio) => {
    // Busca livre: título, cidade, atividade e ano
    if (busca) {
      const termo = busca.toLowerCase();
      const camposTexto = [anuncio.titulo, anuncio.cidade, anuncio.atividade, anuncio.ano]
        .join(" ")
        .toLowerCase();
      if (!camposTexto.includes(termo)) return false;
    }

    // Atividade
    if (atividade && anuncio.atividade.toLowerCase() !== atividade.toLowerCase()) return false;

    // Localização
    if (cidade && !anuncio.cidade.toLowerCase().includes(cidade.toLowerCase())) return false;

    // Preço máximo
    if (precoMax && anuncio.preco > Number(precoMax)) return false;

    // Data
    if (dataInicio || dataFim) {
      const inicio    = dataInicio ? new Date(dataInicio) : null;
      const fim       = dataFim    ? new Date(dataFim)    : null;
      const maqInicio = anuncio.de_comparacao  ? new Date(anuncio.de_comparacao)  : null;
      const maqFim    = anuncio.ate_comparacao ? new Date(anuncio.ate_comparacao) : null;

      // Máquina terminou antes do usuário precisar começar
      if (inicio && maqFim && maqFim < inicio) return false;
      // Máquina só começa depois que o usuário já não precisa mais
      if (fim && maqInicio && maqInicio > fim) return false;
    }

    return true;
  });

  const temFiltro = busca || atividade || cidade || precoMax || dataInicio || dataFim;

  function irParaPagina(n: number) {
    setPagina(n);
    refAnuncios.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleBuscar() { setBuscou(true); setPagina(1); }

  function handleLimpar() {
    setBusca(""); setAtividade(""); setCidade("");
    setPrecoMax(""); setDataInicio(""); setDataFim("");
    setBuscou(false); setPagina(1);
  }

  const lista = buscou ? resultados : anuncios;

  const listaOrdenada = [...lista].sort((a, b) => {
    if (ordenacao === "menor_preco") return a.preco - b.preco;
    if (ordenacao === "maior_preco") return b.preco - a.preco;
    return 0;
  });

  const itensPaginados = listaOrdenada.slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA);
  const totalPgs       = Math.ceil(listaOrdenada.length / ITENS_POR_PAGINA);

  const gridCols    = { 2: "grid-cols-1 md:grid-cols-2", 3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" }[colunas];
  const alturaImagem = { 2: "h-64", 3: "h-52" }[colunas];

  return (
    <div className="min-h-screen bg-[#FFFBEB] flex flex-col">
      <Navbar />

      <div className="flex-1 pt-32 pb-20 max-w-[1200px] mx-auto px-6 w-full">

        {/* Cabeçalho */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-[#1A2414] mb-1">Buscar Maquinário</h1>
          <div className="h-1 w-20 bg-[#F59E0B] mb-3 rounded-full" />
          <p className="text-gray-500 text-sm">Encontre o equipamento ideal para sua safra</p>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-[24px] border border-gray-100 p-8 mb-10 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <SlidersHorizontal className="w-4 h-4 text-[#2D3F1E]" />
            <span className="text-xs font-bold text-[#2D3F1E] uppercase tracking-widest">Filtros</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-3 space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Busca Livre</label>
              <Input placeholder="Ex: Trator, Colheitadeira..." value={busca} onChange={(evento) => setBusca(evento.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Atividade Agrícola</label>
              <Select value={atividade} onValueChange={(v) => setAtividade(v === "todas" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="Plantio e cultivo">Plantio e cultivo</SelectItem>
                  <SelectItem value="Pulverização">Pulverização</SelectItem>
                  <SelectItem value="Colheita">Colheita</SelectItem>
                  <SelectItem value="Preparo de solo">Preparo de solo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Localização</label>
              <Input placeholder="Ex: Sorriso, MT" value={cidade} onChange={(evento) => setCidade(evento.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Preço máx. (R$/h)</label>
              <Input type="number" placeholder="Ex: 400" min={0} value={precoMax} onChange={(evento) => setPrecoMax(evento.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Data Início
              </label>
              <Input type="date" value={dataInicio} onChange={(evento) => setDataInicio(evento.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Data Fim
              </label>
              <Input type="date" value={dataFim} onChange={(evento) => setDataFim(evento.target.value)} />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-100">
            {temFiltro && (
              <Button variant="outline" onClick={handleLimpar} className="gap-2 text-gray-500">
                <X className="w-4 h-4" /> Limpar filtros
              </Button>
            )}
            <Button onClick={handleBuscar} className="bg-[#2D3F1E] hover:bg-[#1A2414] text-white gap-2 px-8">
              <Search className="w-4 h-4" /> Buscar
            </Button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-sm">Carregando anúncios...</p>
          </div>
        )}

        {/* Erro de conexão */}
        {!loading && erro && (
          <div className="text-center py-20 bg-white rounded-[24px] border border-red-100">
            <p className="text-red-500 font-bold mb-2">Erro ao carregar</p>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">{erro}</p>
          </div>
        )}

        {/* Barra: contagem + ordenação + grade */}
        <div ref={refAnuncios} />
        {!loading && !erro && (
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <p className="text-sm text-gray-500">
              {buscou ? (
                <><span className="font-bold text-[#2D3F1E]">{resultados.length}</span> equipamento{resultados.length !== 1 ? "s" : ""} encontrado{resultados.length !== 1 ? "s" : ""}</>
              ) : (
                <><span className="font-bold text-[#2D3F1E]">{anuncios.length}</span> equipamento{anuncios.length !== 1 ? "s" : ""} disponíve{anuncios.length !== 1 ? "is" : "l"}</>
              )}
            </p>

            <div className="flex items-center gap-3">
              <Select value={ordenacao} onValueChange={(v) => { setOrdenacao(v as typeof ordenacao); setPagina(1); }}>
                <SelectTrigger className="w-44 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevancia">Relevância</SelectItem>
                  <SelectItem value="menor_preco">Menor Preço</SelectItem>
                  <SelectItem value="maior_preco">Maior Preço</SelectItem>
                  <SelectItem value="recentes">Recentes</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-1 border border-gray-200 rounded-xl p-1 bg-white">
                {([2, 3] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setColunas(n)}
                    title={`${n} por linha`}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                      colunas === n ? "bg-[#2D3F1E] text-white" : "text-gray-400 hover:text-[#2D3F1E] hover:bg-[#F3F0E6]"
                    }`}
                  >
                    <IconeGrade n={n} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sem resultados */}
        {!loading && !erro && buscou && resultados.length === 0 && (
          <div className="text-center py-20 bg-white rounded-[24px] border border-gray-100">
            <div className="bg-[#F3F0E6] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <SearchX className="w-8 h-8 text-[#2D3F1E]" />
            </div>
            <h3 className="text-xl font-bold text-[#1A2414] mb-2">Nenhum equipamento encontrado</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Não encontramos anúncios para os filtros selecionados. Tente ajustar a localização, o período ou o tipo de atividade.
            </p>
            <Button variant="outline" onClick={handleLimpar} className="mt-6 gap-2">
              <X className="w-4 h-4" /> Limpar filtros
            </Button>
          </div>
        )}

        {/* Grid de cards */}
        {!loading && !erro && itensPaginados.length > 0 && (
          <div className={`grid ${gridCols} gap-8`}>
            {itensPaginados.map((anuncio) => (
              <div key={anuncio.id} className="bg-white border border-gray-100 rounded-[20px] overflow-hidden group shadow-sm hover:shadow-xl transition-all duration-300">
                <div className={`${alturaImagem} relative overflow-hidden bg-gray-100`}>
                  <img src={anuncio.imagem} alt={anuncio.titulo} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(evento) => { evento.currentTarget.src = FALLBACK_IMG; }} />
                  <div className="absolute top-3 right-3 bg-[#2D3F1E] text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-widest shadow">
                    Disponível
                  </div>
                </div>

                <div className="p-6 flex flex-col gap-3">
                  <h4 className="font-bold text-[#1A2414] text-base leading-tight">{anuncio.titulo}</h4>

                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <MapPin className="w-4 h-4 shrink-0" /> {anuncio.cidade}
                  </p>

                  <div className="border-t border-gray-100 pt-3 flex flex-col gap-1.5 text-xs">
                    <div className="flex gap-2 flex-wrap">
                      {anuncio.atividade && (
                        <span className="bg-[#F3F0E6] text-[#2D3F1E] font-bold px-2.5 py-1 rounded-lg">{anuncio.atividade}</span>
                      )}
                      {anuncio.ano !== "—" && (
                        <span className="bg-gray-50 text-gray-500 font-medium px-2.5 py-1 rounded-lg">Ano: {anuncio.ano}</span>
                      )}
                    </div>
                    <span className="bg-gray-50 text-gray-500 font-medium px-2.5 py-1 rounded-lg w-fit">{anuncio.de} – {anuncio.ate}</span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <div className="text-2xl font-black text-[#2D3F1E]">
                      R$ {anuncio.preco.toFixed(2)}<span className="text-sm font-bold text-gray-400">/h</span>
                    </div>
                    <Link to={`/anuncio/${anuncio.id}`} className="bg-[#2D3F1E] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#1A2414] transition-colors">
                      Ver Detalhes
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginação */}
        {!loading && !erro && lista.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-12">
            <button onClick={() => irParaPagina(Math.max(1, pagina - 1))} disabled={pagina === 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-[#2D3F1E] hover:bg-[#F3F0E6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPgs }, (_, i) => i + 1).map((numeroPagina) => (
              <button key={numeroPagina} onClick={() => irParaPagina(numeroPagina)}
                className={`w-9 h-9 rounded-xl text-sm font-bold transition-colors ${numeroPagina === pagina ? "bg-[#2D3F1E] text-white shadow-sm" : "border border-gray-200 bg-white text-[#2D3F1E] hover:bg-[#F3F0E6]"}`}>
                {numeroPagina}
              </button>
            ))}

            <button onClick={() => irParaPagina(Math.min(totalPgs, pagina + 1))} disabled={pagina === totalPgs}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-[#2D3F1E] hover:bg-[#F3F0E6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>

      <Footer />
    </div>
  );
};

export default BuscarMaquinario;
