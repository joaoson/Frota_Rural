import { useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { NotificationList } from "./NotificationList";
import { notificationKinds, type NotificationKind } from "../types/notification";

function Inbox() {
  const [kind, setKind] = useState<NotificationKind | "">("");
  const [unread, setUnread] = useState(false);
  const [offset, setOffset] = useState(0);

  return <section className="space-y-6" aria-labelledby="notification-heading">
    <div>
      <h1 id="notification-heading" className="font-headline text-3xl font-bold text-primary">Notificações</h1>
      <div className="mt-2 h-1 w-16 bg-secondary-container" />
      <p className="mt-3 text-sm text-on-surface-variant">Acompanhe suas locações, pagamentos e contratos.</p>
    </div>
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1 text-sm font-bold text-on-surface">
        <label htmlFor="notification-kind">Tipo de notificação</label>
        <select id="notification-kind" value={kind} onChange={(event) => { setKind(event.target.value as NotificationKind | ""); setOffset(0); }}
          className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 font-normal">
          <option value="">Todos os tipos</option>
          {Object.entries(notificationKinds).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 py-2 text-sm text-on-surface">
        <input type="checkbox" checked={unread} onChange={(event) => { setUnread(event.target.checked); setOffset(0); }} className="accent-primary" />
        Somente não lidas
      </label>
    </div>
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
      <NotificationList filter={{ limit: 20, offset, ...(kind ? { kind } : {}), ...(unread ? { unread: true } : {}) }} onPageChange={setOffset} />
    </div>
  </section>;
}

export function NotificationsPanel() {
  const { userId, isAuthenticated, isLoading } = useAuth();
  return isAuthenticated && !isLoading && userId ? <Inbox key={userId} /> : null;
}
