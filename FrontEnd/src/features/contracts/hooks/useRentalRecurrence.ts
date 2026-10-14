import { useRef, useState } from "react";
import { contractStore } from "@/app/container";
import type { RecurrenceCreated, RecurrenceInput, RecurrencePreview } from "../types/recurrence";

function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues também funciona no HTTP da rede local usado pelo Docker.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Mantém a prévia vinculada aos campos exatos que foram validados pelo servidor. */
export function useRentalRecurrence(sourceId: string) {
  const [input, setInput] = useState<RecurrenceInput>({ first_start_date: "", frequency: "weekly", occurrences: 2 });
  const [preview, setPreview] = useState<RecurrencePreview | null>(null);
  const [created, setCreated] = useState<RecurrenceCreated | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const revision = useRef(0);
  const creatingRef = useRef(false);
  const attemptKey = useRef<string | null>(null);

  function updateInput(next: RecurrenceInput) {
    if (creatingRef.current || (next.first_start_date === input.first_start_date && next.frequency === input.frequency && next.occurrences === input.occurrences)) return;
    revision.current += 1;
    attemptKey.current = null;
    setInput(next);
    setPreview(null);
    setError(null);
    setPreviewing(false);
  }

  async function requestPreview() {
    if (creatingRef.current) return;
    const requestRevision = ++revision.current;
    setPreview(null);
    setError(null);
    setPreviewing(true);
    try {
      const result = await contractStore.previewRecurrence(sourceId, input);
      if (revision.current === requestRevision) setPreview(result);
    } catch (failure) {
      if (revision.current === requestRevision) setError(failure instanceof Error ? failure : new Error("Não foi possível consultar as datas."));
    } finally {
      if (revision.current === requestRevision) setPreviewing(false);
    }
  }

  async function create() {
    if (!preview || creatingRef.current || created) return;
    creatingRef.current = true;
    setCreating(true);
    setError(null);
    // Mesmo identificador numa repetição após perda de conexão: o servidor não duplica reservas.
    try {
      attemptKey.current ??= createIdempotencyKey();
      const result = await contractStore.createRecurrence(sourceId, { ...input, idempotency_key: attemptKey.current });
      setCreated(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error("Não foi possível criar as reservas."));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  function startAnother() {
    if (creatingRef.current) return;
    revision.current += 1;
    attemptKey.current = null;
    setInput({ ...input, first_start_date: "" });
    setPreview(null);
    setCreated(null);
    setError(null);
  }

  return { startAnother, input, updateInput, preview, created, error, previewing, creating, requestPreview, create };
}
