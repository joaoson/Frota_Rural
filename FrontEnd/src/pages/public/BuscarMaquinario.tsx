import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MaterialIcon from "@/components/MaterialIcon";
import { LoadingState } from "@/shared/components/LoadingState";
import { ErrorState } from "@/shared/components/ErrorState";
import { PageShell } from "@/shared/components/PageShell";
import { usePostings } from "@/features/postings/hooks/usePostings";
import { postingMachineName, type PostingListItem } from "@/features/postings/types/posting";

const ITENS_POR_PAGINA = 9;
const FALLBACK_IMG = "https://placehold.co/800x600/e8e0d0/2D3F1E?text=Sem+foto";

// Ícone de grade das colunas
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

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("pt-BR");
}

function toComparableDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function mapPosting(posting: PostingListItem): Anuncio {
  return {
    id: posting.id,
    imagem: posting.primaryPhotoUrl ?? FALLBACK_IMG,
    titulo: postingMachineName(posting),
    cidade: posting.locationAddress ?? "—",
    preco: posting.hourlyRate,
    atividade: posting.machineUsagePurpose ?? "",
    ano: posting.machineYear ? String(posting.machineYear) : "—",
    de: formatDate(posting.availabilityStart),
    ate: formatDate(posting.availabilityEnd),
    de_comparacao: toComparableDate(posting.availabilityStart),
    ate_comparacao: toComparableDate(posting.availabilityEnd),
  };
}

const BuscarMaquinario = () => {
  // Dados do back
  const postingsQuery = usePostings({ status: "active" });
  const anuncios = useMemo(
    () => (postingsQuery.data ?? []).map(mapPosting),
    [postingsQuery.data],
  );
  const loading = postingsQuery.isLoading;
  const erro = postingsQuery.isError
    ? "Não foi possível carregar os anúncios. Verifique se o servidor está rodando."
    : null;

  // Filtros
  const [busca,       setBusca]       = useState("");
  const [atividade,   setAtividade]   = useState("");
  const [cidade,      setCidade]      = useState("");
  const [precoMaxInput, setPrecoMaxInput] = useState("");
  const [precoMax,      setPrecoMax]      = useState("");
  const [dataInicio,  setDataInicio]  = useState("");
  const [dataFim,     setDataFim]     = useState("");

  // Grade e ordenação
  const [colunas,   setColunas]   = useState<2 | 3>(3);
  const [ordenacao, setOrdenacao] = useState<"relevancia" | "menor_preco" | "maior_preco" | "recentes">("relevancia");

  // Paginação
  const [pagina, setPagina] = useState(1);

  const refAnuncios = useRef<HTMLDivElement>(null);

  // Scroll ao entrar na página
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Debounce preço: aplica o filtro 400ms após o usuário parar de digitar
  useEffect(() => {
    const t = setTimeout(() => setPrecoMax(precoMaxInput), 400);
    return () => clearTimeout(t);
  }, [precoMaxInput]);

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

  const temFiltro = busca || atividade || cidade || precoMaxInput || dataInicio || dataFim;

  // Resetar página ao mudar qualquer filtro. Guardar a assinatura dos filtros e
  // comparar no render evita o setState-dentro-de-efeito.
  const assinaturaFiltros = `${busca}|${atividade}|${cidade}|${precoMax}|${dataInicio}|${dataFim}`;
  const [ultimaAssinatura, setUltimaAssinatura] = useState(assinaturaFiltros);
  if (assinaturaFiltros !== ultimaAssinatura) {
    setUltimaAssinatura(assinaturaFiltros);
    setPagina(1);
  }

  function irParaPagina(n: number) {
    setPagina(n);
    refAnuncios.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleLimpar() {
    setBusca(""); setAtividade(""); setCidade("");
    setPrecoMaxInput(""); setPrecoMax(""); setDataInicio(""); setDataFim("");
  }

  const lista = resultados;

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
    <PageShell width="extraWide">

        {/* Cabeçalho */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-on-surface mb-1">Buscar Maquinário</h1>
          <div className="h-1 w-20 bg-secondary-container mb-3 rounded-full" />
          <p className="text-on-surface-variant text-sm">Encontre o equipamento ideal para sua safra</p>
        </div>

        {/* Filtros */}
        <div className="bg-surface-container-lowest rounded-[24px] border border-outline-variant/30 p-8 mb-10 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <MaterialIcon icon="tune" size={16} className="text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Filtros</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-3 space-y-2">
              <label className="text-[10px] font-bold text-outline uppercase tracking-widest">Busca Livre</label>
              <Input placeholder="Ex: Trator, Colheitadeira..." value={busca} onChange={(evento) => setBusca(evento.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-outline uppercase tracking-widest">Atividade Agrícola</label>
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
              <label className="text-[10px] font-bold text-outline uppercase tracking-widest">Localização</label>
              <Input placeholder="Ex: Sorriso, MT" value={cidade} onChange={(evento) => setCidade(evento.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-outline uppercase tracking-widest">Preço máx. (R$/h)</label>
              <Input type="number" placeholder="Ex: 400" min={0} value={precoMaxInput} onChange={(evento) => setPrecoMaxInput(evento.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-outline uppercase tracking-widest flex items-center gap-1">
                <MaterialIcon icon="calendar_month" size={12} /> Data Início
              </label>
              <Input type="date" value={dataInicio} onChange={(evento) => setDataInicio(evento.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-outline uppercase tracking-widest flex items-center gap-1">
                <MaterialIcon icon="calendar_month" size={12} /> Data Fim
              </label>
              <Input type="date" value={dataFim} onChange={(evento) => setDataFim(evento.target.value)} />
            </div>
          </div>

          {temFiltro && (
            <div className="flex justify-end mt-6 pt-6 border-t border-outline-variant/30">
              <Button variant="outline" onClick={handleLimpar} className="gap-2 text-on-surface-variant">
                <MaterialIcon icon="close" size={16} /> Limpar filtros
              </Button>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <LoadingState variant="text" label="Carregando anúncios..." />
        )}

        {/* Erro de conexão */}
        {!loading && erro && (
          <ErrorState message={erro} />
        )}

        {/* Barra: contagem + ordenação + grade */}
        <div ref={refAnuncios} />
        {!loading && !erro && (
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <p className="text-sm text-on-surface-variant">
              <span className="font-bold text-primary">{resultados.length}</span> equipamento{resultados.length !== 1 ? "s" : ""} disponíve{resultados.length !== 1 ? "is" : "l"}
            </p>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-outline whitespace-nowrap">Ordenar por</span>
                <Select value={ordenacao} onValueChange={(v) => { setOrdenacao(v as typeof ordenacao); setPagina(1); }}>
                  <SelectTrigger className="w-44 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevancia">Relevância</SelectItem>
                    <SelectItem value="menor_preco">Menor Preço</SelectItem>
                    <SelectItem value="maior_preco">Maior Preço</SelectItem>
                    <SelectItem value="recentes">Recentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-1 border border-outline-variant/40 rounded-xl p-1 bg-surface-container-lowest">
                {([2, 3] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setColunas(n)}
                    title={`${n} por linha`}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                      colunas === n ? "bg-primary-container text-on-primary" : "text-outline hover:text-primary hover:bg-surface-container"
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
        {!loading && !erro && temFiltro && resultados.length === 0 && (
          <div className="text-center py-20 bg-surface-container-lowest rounded-[24px] border border-outline-variant/30">
            <div className="bg-surface-container w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <MaterialIcon icon="search_off" size={32} className="text-primary" />
            </div>
            <h3 className="text-xl font-bold text-on-surface mb-2">Nenhum equipamento encontrado</h3>
            <p className="text-on-surface-variant text-sm max-w-sm mx-auto">
              Não encontramos anúncios para os filtros selecionados. Tente ajustar a localização, o período ou o tipo de atividade.
            </p>
            <Button variant="outline" onClick={handleLimpar} className="mt-6 gap-2">
              <MaterialIcon icon="close" size={16} /> Limpar filtros
            </Button>
          </div>
        )}

        {/* Grid de cards */}
        {!loading && !erro && itensPaginados.length > 0 && (
          <div className={`grid ${gridCols} gap-8`}>
            {itensPaginados.map((anuncio) => (
              <div key={anuncio.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-[20px] overflow-hidden group shadow-sm hover:shadow-xl transition-all duration-300">
                <div className={`${alturaImagem} relative overflow-hidden bg-surface-container-high`}>
                  <img src={anuncio.imagem} alt={anuncio.titulo} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(evento) => { evento.currentTarget.src = FALLBACK_IMG; }} />
                  <div className="absolute top-3 right-3 bg-primary-container text-on-primary text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-widest shadow">
                    Disponível
                  </div>
                </div>

                <div className="p-6 flex flex-col gap-3">
                  <h4 className="font-bold text-on-surface text-base leading-tight">{anuncio.titulo}</h4>

                  <p className="text-sm text-on-surface-variant flex items-center gap-1">
                    <MaterialIcon icon="location_on" size={16} className="shrink-0" /> {anuncio.cidade}
                  </p>

                  <div className="border-t border-outline-variant/30 pt-3 flex flex-col gap-1.5 text-xs">
                    <div className="flex gap-2 flex-wrap">
                      {anuncio.atividade && (
                        <span className="bg-surface-container text-primary font-bold px-2.5 py-1 rounded-lg">{anuncio.atividade}</span>
                      )}
                      {anuncio.ano !== "—" && (
                        <span className="bg-surface-container text-on-surface-variant font-medium px-2.5 py-1 rounded-lg">Ano: {anuncio.ano}</span>
                      )}
                    </div>
                    <span className="bg-surface-container text-on-surface-variant font-medium px-2.5 py-1 rounded-lg w-fit">{anuncio.de} – {anuncio.ate}</span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <div className="text-2xl font-black text-primary">
                      R$ {anuncio.preco.toFixed(2)}<span className="text-sm font-bold text-outline">/h</span>
                    </div>
                    <Link to={`/anuncio/${anuncio.id}`} className="bg-primary-container text-on-primary px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-primary transition-colors">
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
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-primary hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <MaterialIcon icon="chevron_left" size={16} />
            </button>

            {Array.from({ length: totalPgs }, (_, i) => i + 1).map((numeroPagina) => (
              <button key={numeroPagina} onClick={() => irParaPagina(numeroPagina)}
                className={`w-9 h-9 rounded-xl text-sm font-bold transition-colors ${numeroPagina === pagina ? "bg-primary-container text-on-primary shadow-sm" : "border border-outline-variant/40 bg-surface-container-lowest text-primary hover:bg-surface-container"}`}>
                {numeroPagina}
              </button>
            ))}

            <button onClick={() => irParaPagina(Math.min(totalPgs, pagina + 1))} disabled={pagina === totalPgs}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-primary hover:bg-surface-container disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <MaterialIcon icon="chevron_right" size={16} />
            </button>
          </div>
        )}

    </PageShell>
  );
};

export default BuscarMaquinario;
