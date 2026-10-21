import { useCallback, useMemo, useState, useSyncExternalStore, type SetStateAction } from "react";
import { z } from "zod";

const changeEvent = "frota-dashboard-preference";
const memory = new Map<string, string>();

export const searchPreference = z.string().max(200);
export const yearPreference = z.string().regex(/^(Todos|\d{4})$/);
export const contractPreference = z.enum(["Todos", "Pendentes", "Assinados", "Encerrados"]);
export const searchMapPreference = z.record(z.string(), searchPreference);
export const yearMapPreference = z.record(z.string(), yearPreference);

function read(key: string | null): string | null {
  if (!key) return null;
  if (memory.has(key)) return memory.get(key) ?? null;
  try { return window.localStorage.getItem(key); }
  catch { return memory.get(key) ?? null; }
}

/** Versioned preferences belong to one account and one dashboard section. */
export function useDashboardPreference<T>(
  userId: string | null,
  section: string,
  schema: z.ZodType<T>,
  fallback: T,
) {
  const key = userId ? `frota:dashboard:v1:${userId}:${section}` : null;
  const [guestValue, setGuestValue] = useState(fallback);
  const subscribe = useCallback((listener: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) listener();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(changeEvent, listener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(changeEvent, listener);
    };
  }, [key]);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = useMemo(() => {
    if (!key) return guestValue;
    try {
      const result = schema.safeParse(JSON.parse(raw ?? "null"));
      return result.success ? result.data : fallback;
    } catch { return fallback; }
  }, [key, raw, schema, fallback, guestValue]);

  const setValue = (next: SetStateAction<T>) => {
    const resolved = typeof next === "function" ? (next as (current: T) => T)(value) : next;
    const parsed = schema.safeParse(resolved);
    if (!parsed.success) return;
    if (!key) { setGuestValue(parsed.data); return; }
    const serialized = JSON.stringify(parsed.data);
    try { window.localStorage.setItem(key, serialized); memory.delete(key); }
    catch { memory.set(key, serialized); }
    window.dispatchEvent(new Event(changeEvent));
  };
  return [value, setValue] as const;
}

export function resetDashboardPreferences(userId: string) {
  const prefix = `frota:dashboard:v1:${userId}:`;
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch { /* Preferences still work for the current session when storage is blocked. */ }
  window.dispatchEvent(new Event(changeEvent));
}
