import { z } from "zod";
import { AuthContext } from "@/contexts/authContextValue";
import { useDashboardPreference } from "../hooks/useDashboardPreference";
import { useContext, useId, useRef, useState, type ReactNode } from "react";

import DashboardPagination from "@/components/DashboardPagination";
import MaterialIcon from "@/components/MaterialIcon";

const viewSchema = z.enum(["list", "grid"]);
const sizeSchema = z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(48)]);

export type DashboardView = "list" | "grid";

interface DashboardCollectionProps<T> {
  label: string;
  items: readonly T[];
  renderItem: (item: T, view: DashboardView) => ReactNode;
  defaultView?: DashboardView;
  /** Hide the count / page-size / view bar for collections that never hold more than one record. */
  showToolbar?: boolean;
  resetKey?: string;
  focusItemId?: string;
  getGroup?: (item: T) => string;
}

/** Preferences persist per account; pagination stays local to each collection. */
export function DashboardCollection<T extends { id: string }>({
  label,
  items,
  renderItem,
  defaultView = "grid",
  showToolbar = true,
  resetKey = "",
  focusItemId,
  getGroup,
}: DashboardCollectionProps<T>) {
  const sizeId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const userId = useContext(AuthContext)?.userId ?? null;
  const [storedView, setView] = useDashboardPreference<DashboardView>(userId, `${label}:view`, viewSchema, defaultView);
  const view = showToolbar ? storedView : defaultView;
  const [pageSize, setPageSize] = useDashboardPreference<number>(userId, `${label}:size`, sizeSchema, 6);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const focusIndex = items.findIndex((item) => item.id === focusItemId);
  const resolvedFocusId = focusIndex >= 0 ? focusItemId : undefined;
  const [position, setPosition] = useState({ page: 1, resetKey, focusItemId: undefined as string | undefined });

  // Reset filtered results, clamp after deletion, and reveal deep links even
  // when their records arrive asynchronously. Manual paging remains possible.
  const page = resetKey !== position.resetKey ? 1
    : resolvedFocusId && resolvedFocusId !== position.focusItemId ? Math.floor(focusIndex / pageSize) + 1
    : Math.min(position.page, totalPages);
  if (page !== position.page || resetKey !== position.resetKey || resolvedFocusId !== position.focusItemId) {
    setPosition({ page, resetKey, focusItemId: resolvedFocusId });
  }

  const start = (page - 1) * pageSize;
  const visibleItems = items.slice(start, start + pageSize);
  const groups = new Map<string, T[]>();
  for (const item of visibleItems) {
    const group = getGroup?.(item) ?? "";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }

  return (
    <section ref={sectionRef} aria-label={label} className="@container/collection min-w-0 scroll-mt-20 space-y-4" data-view={view}>
      {showToolbar && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3">
        <p role="status" className="text-sm text-on-surface-variant">
          {items.length === 0 ? "0 itens" : `${start + 1}–${Math.min(start + pageSize, items.length)} de ${items.length} ${items.length === 1 ? "item" : "itens"}`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor={sizeId} className="text-sm text-on-surface-variant">Itens por página</label>
            <select
              id={sizeId}
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPosition({ ...position, page: 1 });
              }}
              className="min-h-11 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-2 text-sm text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
            >
              {[6, 12, 24, 48].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          <div role="group" aria-label="Visualização" className="flex rounded-lg border border-outline-variant/40 p-1">
            {(["list", "grid"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={`flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${view === mode ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-high"}`}
              >
                <MaterialIcon icon={mode === "list" ? "view_list" : "grid_view"} size={18} />
                {mode === "list" ? "Lista" : "Grade"}
              </button>
            ))}
          </div>
        </div>
      </div>}
      {Array.from(groups, ([group, records]) => (
        <div key={group} className="space-y-4">
          {group && <h2 className="font-headline text-lg font-bold text-on-surface">{group}</h2>}
          <div className={view === "grid" ? "grid grid-cols-1 gap-4 @3xl/collection:grid-cols-2" : "grid grid-cols-1 gap-4"}>
            {records.map((item) => <div key={item.id} className="min-w-0 [overflow-wrap:anywhere] [&>*]:h-full">{renderItem(item, view)}</div>)}
          </div>
        </div>
      ))}
      <DashboardPagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={(next) => {
          setPosition({ ...position, page: next });
          sectionRef.current?.scrollIntoView?.({ block: "start" });
        }}
        label={`Paginação de ${label}`}
      />
    </section>
  );
}
