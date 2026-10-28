import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { brazilRegions } from "@/shared/lib/brazil";
import type { useMachineFinder } from "../hooks/useMachineFinder";
import { applications, soils, tomorrowDate } from "../types/machineFinder";

type Finder = ReturnType<typeof useMachineFinder>;

export function MachineFinderAnswer({ finder }: { finder: Finder }) {
  const { step, answers, answer } = finder;
  const [state, setState] = useState<string>(answers.state ?? "");
  const [start, setStart] = useState(answers.startDate ?? "");
  const [end, setEnd] = useState(answers.endDate ?? "");
  const [error, setError] = useState("");
  const region = brazilRegions.find((item) => item.value === answers.region);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step === 3) {
      const selected = region?.states.find((item) => item.code === state);
      if (!selected) { setError("Selecione um estado da região escolhida."); return; }
      answer({ state: selected.code }, `${selected.name} (${selected.code})`);
    } else if (step === 4) {
      if (!start || !end || start < tomorrowDate() || end < start) {
        setError("Escolha as duas datas, a partir de amanhã, com o fim igual ou posterior ao início."); return;
      }
      const format = (date: string) => date.split("-").reverse().join("/");
      answer({ startDate: start, endDate: end }, `${format(start)} a ${format(end)}`);
    }
  }

  if (step === 0 || step === 1) return (
    <div className="machine-finder__choices" role="group" aria-label={step === 0 ? "Atividade desejada" : "Tipo de solo"}>
      {step === 0 ? applications.map((option) => <button key={option.value} type="button" onClick={() => answer({ application: option.value }, option.label)}>{option.label}<ArrowRight size={15} aria-hidden="true" /></button>)
        : soils.map((option) => <button key={option.value} type="button" onClick={() => answer({ soil: option.value }, option.label)}>{option.label}<ArrowRight size={15} aria-hidden="true" /></button>)}
    </div>
  );

  if (step === 2) return (
    <div className="machine-finder__choices" role="group" aria-label="Região do Brasil">
      {brazilRegions.map((option) => <button key={option.value} type="button" onClick={() => answer({ region: option.value }, option.label)}>{option.label}<ArrowRight size={15} aria-hidden="true" /></button>)}
    </div>
  );

  return (
    <form onSubmit={submit} className="machine-finder__form">
      {step === 3 && <>
        <p className="machine-finder__hint">Estados da região {region?.label}.</p>
        <label>Estado
          <select value={state} autoComplete="address-level1" aria-invalid={!!error} aria-describedby={error ? "machine-finder-answer-error" : undefined}
            onChange={(event) => { setState(event.target.value); setError(""); }}>
            <option value="" disabled>Selecione um estado</option>
            {region?.states.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
          </select>
        </label>
      </>}
      {step === 4 && <>
        <p className="machine-finder__hint">Vou consultar dias inteiros e o intervalo entre reservas.</p>
        <div className="machine-finder__dates">
          <label>Data de início<input type="date" value={start} min={tomorrowDate()} onChange={(event) => { setStart(event.target.value); setError(""); }} /></label>
          <label>Data de fim<input type="date" value={end} min={start || tomorrowDate()} onChange={(event) => { setEnd(event.target.value); setError(""); }} /></label>
        </div>
      </>}
      {error && <p id="machine-finder-answer-error" role="alert" className="machine-finder__error">{error}</p>}
      <div className="machine-finder__form-actions">
        <button type="submit" className="machine-finder__primary">{step === 4 ? "Encontrar máquinas" : "Continuar"}<ArrowRight size={16} aria-hidden="true" /></button>
        {step === 4 && <button type="button" className="machine-finder__skip" onClick={() => answer({ startDate: null, endDate: null }, "Datas ainda não definidas")}>Ainda não defini as datas</button>}
      </div>
    </form>
  );
}
