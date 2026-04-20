import { useState } from "react";
import { Link } from "react-router";
import {
  Search,
  MapPin,
  Star,
  CalendarDays,
  SlidersHorizontal,
  X,
  SearchX,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Mock do banco de dados
const anuncios = [
  {
    id: 1,
    imagem: "https://loremflickr.com/800/600/harvester,agriculture?lock=1",
    titulo: "Colheitadeira JD S700",
    cidade: "Sorriso, MT",
    preco: 480,
    atividade: "Colheita",
    horas: "2.450 h",
    nota: 4.8,
    de: "01/03/2026",
    ate: "30/04/2026",
  },
  {
    id: 2,
    imagem: "https://loremflickr.com/800/600/tractor,farm?lock=2",
    titulo: "Trator Valtra BH194",
    cidade: "Lucas do Rio Verde, MT",
    preco: 320,
    atividade: "Preparo de Solo",
    horas: "1.800 h",
    nota: 4.5,
    de: "15/02/2026",
    ate: "20/05/2026",
  },
  {
    id: 3,
    imagem: "https://loremflickr.com/800/600/sprayer,agriculture?lock=3",
    titulo: "Pulverizador Jacto Uniport",
    cidade: "Rondonópolis, MT",
    preco: 250,
    atividade: "Pulverização",
    horas: "950 h",
    nota: 4.9,
    de: "01/02/2026",
    ate: "30/06/2026",
  },
  {
    id: 4,
    imagem: "https://loremflickr.com/800/600/harvester,field?lock=4",
    titulo: "Colheitadeira NH CR 7.90",
    cidade: "Primavera do Leste, MT",
    preco: 520,
    atividade: "Colheita",
    horas: "3.100 h",
    nota: 4.6,
    de: "10/03/2026",
    ate: "15/05/2026",
  },
  {
    id: 5,
    imagem: "https://loremflickr.com/800/600/tractor,agriculture?lock=5",
    titulo: "Trator MF 8737",
    cidade: "Campo Verde, MT",
    preco: 380,
    atividade: "Plantio",
    horas: "2.200 h",
    nota: 4.7,
    de: "01/09/2026",
    ate: "30/11/2026",
  },
  {
    id: 6,
    imagem: "https://loremflickr.com/800/600/sprayer,field?lock=6",
    titulo: "Pulverizador Stara Imperador 3.0",
    cidade: "Sinop, MT",
    preco: 290,
    atividade: "Pulverização",
    horas: "1.050 h",
    nota: 4.4,
    de: "01/01/2026",
    ate: "31/12/2026",
  },
  {
    id: 7,
    imagem: "https://loremflickr.com/800/600/harvester,grain?lock=7",
    titulo: "Colheitadeira Case IH 8250",
    cidade: "Sapezal, MT",
    preco: 510,
    atividade: "Colheita",
    horas: "2.800 h",
    nota: 4.7,
    de: "01/03/2026",
    ate: "31/05/2026",
  },
  {
    id: 8,
    imagem: "https://loremflickr.com/800/600/tractor,field?lock=8",
    titulo: "Trator John Deere 7215R",
    cidade: "Querência, MT",
    preco: 410,
    atividade: "Plantio",
    horas: "1.600 h",
    nota: 4.6,
    de: "01/08/2026",
    ate: "30/11/2026",
  },
  {
    id: 9,
    imagem: "https://loremflickr.com/800/600/sprayer,crop?lock=9",
    titulo: "Pulverizador Montana 4000",
    cidade: "Água Boa, MT",
    preco: 270,
    atividade: "Pulverização",
    horas: "880 h",
    nota: 4.3,
    de: "01/01/2026",
    ate: "31/12/2026",
  },
];

const ITENS_POR_PAGINA = 9;

const Buscar = () => {
  // Filtros
  const [busca, setBusca] = useState("");
  const [atividade, setAtividade] = useState("");
  const [cidade, setCidade] = useState("");
  const [precoMax, setPrecoMax] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [buscou, setBuscou] = useState(false);

  // Paginação
  const [pagina, setPagina] = useState(1);

  // Filtragem
  const resultados = anuncios
    .filter((a) => {
      if (busca && !a.titulo.toLowerCase().includes(busca.toLowerCase()))
        return false;
      if (atividade && a.atividade !== atividade) return false;
      if (cidade && !a.cidade.toLowerCase().includes(cidade.toLowerCase()))
        return false;
      if (precoMax && a.preco > Number(precoMax)) return false;
      if (dataInicio && a.ate < dataInicio.split("-").reverse().join("/"))
        return false;
      if (dataFim && a.de > dataFim.split("-").reverse().join("/"))
        return false;
      return true;
    })
    .sort((a, b) => b.nota - a.nota); // ordena pela melhor avaliação

  const temFiltro =
    busca || atividade || cidade || precoMax || dataInicio || dataFim;

  function handleBuscar() {
    setBuscou(true);
    setPagina(1);
  }

  function handleLimpar() {
    setBusca("");
    setAtividade("");
    setCidade("");
    setPrecoMax("");
    setDataInicio("");
    setDataFim("");
    setBuscou(false);
    setPagina(1);
  }

  const lista = buscou ? resultados : anuncios;
  const itensPaginados = lista.slice(
    (pagina - 1) * ITENS_POR_PAGINA,
    pagina * ITENS_POR_PAGINA,
  );
  const totalPgs = Math.ceil(lista.length / ITENS_POR_PAGINA);

  return (
    <div className="min-h-screen bg-[#FFFBEB] flex flex-col">
      <Navbar />

      <div className="flex-1 pt-32 pb-20 max-w-[1200px] mx-auto px-6 w-full">
        {/* Cabeçalho */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-[#1A2414] mb-1">
            Buscar Maquinário
          </h1>
          <div className="h-1 w-20 bg-[#F59E0B] mb-3 rounded-full" />
          <p className="text-gray-500 text-sm">
            Encontre o equipamento ideal para sua safra
          </p>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-[24px] border border-gray-100 p-8 mb-10 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <SlidersHorizontal className="w-4 h-4 text-[#2D3F1E]" />
            <span className="text-xs font-bold text-[#2D3F1E] uppercase tracking-widest">
              Filtros
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-3 space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Busca Livre
              </label>
              <Input
                placeholder="Ex: Trator, Colheitadeira..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Atividade Agrícola
              </label>
              <Select
                value={atividade}
                onValueChange={(v) => setAtividade(v === "todas" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="Plantio">Plantio</SelectItem>
                  <SelectItem value="Pulverização">Pulverização</SelectItem>
                  <SelectItem value="Colheita">Colheita</SelectItem>
                  <SelectItem value="Preparo de Solo">
                    Preparo de Solo
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Localização
              </label>
              <Input
                placeholder="Ex: Sorriso, MT"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Preço máx. (R$/h)
              </label>
              <Input
                type="number"
                placeholder="Ex: 400"
                min={0}
                value={precoMax}
                onChange={(e) => setPrecoMax(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Data Início
              </label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Data Fim
              </label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-100">
            {temFiltro && (
              <Button
                variant="outline"
                onClick={handleLimpar}
                className="gap-2 text-gray-500"
              >
                <X className="w-4 h-4" /> Limpar filtros
              </Button>
            )}
            <Button
              onClick={handleBuscar}
              className="bg-[#2D3F1E] hover:bg-[#1A2414] text-white gap-2 px-8"
            >
              <Search className="w-4 h-4" /> Buscar
            </Button>
          </div>
        </div>

        {/* Contagem de resultados */}
        {buscou && (
          <div className="mb-6">
            <p className="text-sm text-gray-500">
              <span className="font-bold text-[#2D3F1E]">
                {resultados.length}
              </span>{" "}
              equipamento{resultados.length !== 1 ? "s" : ""} encontrado
              {resultados.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Sem resultados */}
        {buscou && resultados.length === 0 && (
          <div className="text-center py-20 bg-white rounded-[24px] border border-gray-100">
            <div className="bg-[#F3F0E6] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <SearchX className="w-8 h-8 text-[#2D3F1E]" />
            </div>
            <h3 className="text-xl font-bold text-[#1A2414] mb-2">
              Nenhum equipamento encontrado
            </h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Não encontramos anúncios para os filtros selecionados. Tente
              ajustar a localização, o período ou o tipo de atividade.
            </p>
            <Button
              variant="outline"
              onClick={handleLimpar}
              className="mt-6 gap-2"
            >
              <X className="w-4 h-4" /> Limpar filtros
            </Button>
          </div>
        )}

        {/* Grid de cards */}
        {itensPaginados.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {itensPaginados.map((a) => (
              <div
                key={a.id}
                className="bg-white border border-gray-100 rounded-[20px] overflow-hidden group shadow-sm hover:shadow-xl transition-all duration-300"
              >
                <div className="h-52 relative overflow-hidden bg-gray-100">
                  <img
                    src={a.imagem}
                    alt={a.titulo}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 right-3 bg-[#2D3F1E] text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-widest shadow">
                    Disponível
                  </div>
                </div>

                <div className="p-6 flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-2 min-h-[48px]">
                    <h4 className="font-bold text-[#1A2414] text-base leading-tight">
                      {a.titulo}
                    </h4>
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />{" "}
                      {a.nota}
                    </span>
                  </div>

                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <MapPin className="w-4 h-4 shrink-0" /> {a.cidade}
                  </p>

                  <div className="border-t border-gray-100 pt-3 flex flex-col gap-1.5 text-xs">
                    <div className="flex gap-2">
                      <span className="bg-[#F3F0E6] text-[#2D3F1E] font-bold px-2.5 py-1 rounded-lg">
                        {a.atividade}
                      </span>
                      <span className="bg-gray-50 text-gray-500 font-medium px-2.5 py-1 rounded-lg">
                        {a.horas}
                      </span>
                    </div>
                    <span className="bg-gray-50 text-gray-500 font-medium px-2.5 py-1 rounded-lg w-fit">
                      {a.de} – {a.ate}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <div className="text-2xl font-black text-[#2D3F1E]">
                      R$ {a.preco}
                      <span className="text-sm font-bold text-gray-400">
                        /h
                      </span>
                    </div>
                    <Link
                      to={`/anuncio/${a.id}`}
                      className="bg-[#2D3F1E] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#1A2414] transition-colors"
                    >
                      Ver Detalhes
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginação */}
        {lista.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-12">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-[#2D3F1E] hover:bg-[#F3F0E6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPgs }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPagina(p)}
                className={`w-9 h-9 rounded-xl text-sm font-bold transition-colors ${p === pagina ? "bg-[#2D3F1E] text-white shadow-sm" : "border border-gray-200 bg-white text-[#2D3F1E] hover:bg-[#F3F0E6]"}`}
              >
                {p}
              </button>
            ))}

            <button
              onClick={() => setPagina((p) => Math.min(totalPgs, p + 1))}
              disabled={pagina === totalPgs}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-[#2D3F1E] hover:bg-[#F3F0E6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Buscar;
