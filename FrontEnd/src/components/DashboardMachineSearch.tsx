import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { postingStore } from "@/app/container";
import type { PostingListItem } from "@/features/postings/types/posting";
import MaterialIcon from "@/components/MaterialIcon";


const FALLBACK_IMAGE = "https://placehold.co/800x600/e8e0d0/2D3F1E?text=Sem+foto";

const DashboardMachineSearch = () => {
  const [postings, setPostings] = useState<PostingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState("");
  const [location, setLocation] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    postingStore.list({ status: "active" })
      .then((data: PostingListItem[]) => setPostings(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => postings.filter((posting) => {
    const title = [posting.machineBrand, posting.machineModel].filter(Boolean).join(" ");
    const searchable = [title, posting.locationAddress, posting.machineUsagePurpose, posting.machineYear].join(" ").toLowerCase();
    if (search && !searchable.includes(search.toLowerCase())) return false;
    if (activity && posting.machineUsagePurpose?.toLowerCase() !== activity.toLowerCase()) return false;
    if (location && !posting.locationAddress?.toLowerCase().includes(location.toLowerCase())) return false;
    if (maxPrice && Number(posting.hourlyRate) > Number(maxPrice)) return false;

    // A entidade traz Date; a comparação é textual em YYYY-MM-DD.
    const availableFrom = posting.availabilityStart?.toISOString().slice(0, 10);
    const availableUntil = posting.availabilityEnd?.toISOString().slice(0, 10);
    if (startDate && availableUntil && availableUntil < startDate) return false;
    if (endDate && availableFrom && availableFrom > endDate) return false;
    return true;
  }), [postings, search, activity, location, maxPrice, startDate, endDate]);

  const clearFilters = () => {
    setSearch(""); setActivity(""); setLocation(""); setMaxPrice(""); setStartDate(""); setEndDate("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-3xl font-bold text-primary">Buscar Máquinas</h1>
        <div className="h-1 w-16 bg-secondary-container mt-2" />
        <p className="text-on-surface-variant text-sm mt-3">Encontre equipamentos disponíveis para a sua safra</p>
      </div>

      <section className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5 text-primary">
          <MaterialIcon icon="tune" size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="md:col-span-3 text-xs font-bold text-on-surface-variant uppercase tracking-wider">Busca livre
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex: Trator, Colheitadeira..." className="mt-2 w-full bg-surface-container border-none rounded-lg p-3 text-on-surface normal-case tracking-normal font-normal focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Atividade agrícola
            <select value={activity} onChange={(e) => setActivity(e.target.value)} className="mt-2 w-full bg-surface-container border-none rounded-lg p-3 text-on-surface normal-case tracking-normal font-normal focus:ring-2 focus:ring-primary">
              <option value="">Todas</option><option>Plantio e cultivo</option><option>Pulverização</option><option>Colheita</option><option>Preparo de solo</option>
            </select>
          </label>
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Localização
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Sorriso, MT" className="mt-2 w-full bg-surface-container border-none rounded-lg p-3 text-on-surface normal-case tracking-normal font-normal focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Preço máx. (R$/h)
            <input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Ex: 400" className="mt-2 w-full bg-surface-container border-none rounded-lg p-3 text-on-surface normal-case tracking-normal font-normal focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Data início
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-2 w-full bg-surface-container border-none rounded-lg p-3 text-on-surface normal-case tracking-normal font-normal focus:ring-2 focus:ring-primary" />
          </label>
          <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Data fim
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-2 w-full bg-surface-container border-none rounded-lg p-3 text-on-surface normal-case tracking-normal font-normal focus:ring-2 focus:ring-primary" />
          </label>
          <div className="flex items-end"><button onClick={clearFilters} className="w-full border border-outline-variant/60 text-on-surface-variant rounded-lg py-3 text-sm font-bold hover:bg-surface-container">Limpar filtros</button></div>
        </div>
      </section>

      {loading && <p className="py-10 text-center text-on-surface-variant">Carregando equipamentos disponíveis...</p>}
      {error && <p className="py-10 text-center text-error">Não foi possível carregar os equipamentos. Tente novamente.</p>}
      {!loading && !error && <p className="text-sm text-on-surface-variant"><strong className="text-primary">{results.length}</strong> equipamento{results.length !== 1 ? "s" : ""} disponível{results.length !== 1 ? "is" : ""}</p>}
      {!loading && !error && results.length === 0 && <div className="rounded-2xl bg-surface-container-low p-10 text-center text-on-surface-variant">Nenhum equipamento encontrado para estes filtros.</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {results.map((posting) => {
          const title = [posting.machineBrand, posting.machineModel].filter(Boolean).join(" ") || "Maquinário";
          return <article key={posting.id} className="overflow-hidden rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm">
            <img src={posting.primaryPhotoUrl ?? FALLBACK_IMAGE} onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }} alt={title} className="h-40 w-full object-cover" />
            <div className="p-5 space-y-3"><div><h2 className="font-bold text-on-surface">{title}</h2><p className="text-xs text-on-surface-variant">{posting.locationAddress || "Localização não informada"}</p></div>
              <div className="flex justify-between text-sm"><span>{posting.machineUsagePurpose || "Atividade não informada"}</span><strong className="text-primary">{Number(posting.hourlyRate).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/h</strong></div>
              <Link to={`/anuncio/${posting.id}`} className="flex justify-center rounded-lg bg-primary py-2.5 text-sm font-bold text-on-primary">Ver disponibilidade</Link>
            </div>
          </article>;
        })}
      </div>
    </div>
  );
};

export default DashboardMachineSearch;
