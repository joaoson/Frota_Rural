import { Link } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import { useAuth } from "@/contexts/useAuth";
import { useNotificationActions, useNotifications } from "../hooks/useNotifications";
import { notificationDestination, notificationKinds, type NotificationFilter } from "../types/notification";

const actionClass = "rounded-lg px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50";

export function NotificationList({ filter = {}, compact = false, onOpen, onPageChange }: {
  filter?: NotificationFilter;
  compact?: boolean;
  onOpen?: () => void;
  onPageChange?: (offset: number) => void;
}) {
  const { userRole } = useAuth();
  const query = useNotifications(filter);
  const actions = useNotificationActions();
  const pending = actions.setRead.isPending || actions.dismiss.isPending || actions.readAll.isPending;
  const error = actions.setRead.error || actions.dismiss.error || actions.readAll.error;
  const page = query.data;
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 20;

  function resetErrors() {
    actions.setRead.reset();
    actions.dismiss.reset();
    actions.readAll.reset();
  }

  return (
    <div aria-busy={query.isFetching || pending}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/20 p-4">
        <span className="text-xs text-on-surface-variant" aria-live="polite">
          {page ? `${page.unread_count} não lidas` : "Notificações da sua conta"}
        </span>
        <button type="button" className={actionClass} disabled={!page?.unread_count || pending}
          onClick={() => { resetErrors(); actions.readAll.mutate(); }}>
          Marcar todas como lidas
        </button>
      </div>
      {query.isPending && <p role="status" className="p-6 text-sm text-on-surface-variant">Carregando notificações...</p>}
      {query.isError && <div role="alert" className="p-4 text-sm text-error">
        <p>{page ? "Não foi possível atualizar as notificações. Os dados podem estar desatualizados." : "Não foi possível carregar as notificações."}</p>
        <button type="button" className={actionClass} onClick={() => void query.refetch()}>Tentar novamente</button>
      </div>}
      {error && <p role="alert" className="px-4 py-3 text-sm text-error">Não foi possível salvar a alteração. Tente novamente.</p>}
      {page?.results.length === 0 && <div className="p-8 text-center text-on-surface-variant" role="status">
        <MaterialIcon icon="notifications_none" size={32} className="mx-auto mb-3 text-outline" />
        <p className="font-bold text-on-surface">{filter.kind || filter.unread ? "Nenhuma notificação neste filtro" : "Nenhuma notificação por enquanto"}</p>
        <p className="mt-1 text-sm">As atualizações das suas locações, pagamentos e contratos aparecerão aqui.</p>
      </div>}
      {page && page.results.length > 0 && <ul aria-label="Lista de notificações" className={compact ? "max-h-96 overflow-y-auto" : "divide-y divide-outline-variant/20"}>
        {page.results.map((item) => {
          const kind = notificationKinds[item.kind];
          const destination = notificationDestination(item, userRole);
          const date = new Date(item.created_at);
          return <li key={item.id} className={`flex items-start gap-3 border-b border-outline-variant/10 p-4 ${item.is_read ? "" : "bg-primary/5"}`}>
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MaterialIcon icon={kind.icon} size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
                <span>{kind.label}</span>
                {!item.is_read && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">Não lida</span>}
                <time dateTime={item.created_at} title={date.toLocaleString("pt-BR")}>{date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</time>
              </div>
              <h3 className="mt-1 text-sm font-bold text-on-surface">{item.title}</h3>
              <p className="mt-1 break-words text-sm text-on-surface-variant">{item.message}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {destination && <Link to={destination} className={actionClass} onClick={() => {
                  if (!item.is_read && !pending) { resetErrors(); actions.setRead.mutate({ id: item.id, isRead: true }); }
                  onOpen?.();
                }}>{item.kind === "contract" && item.contract ? "Ver contrato" : "Ver locação"}</Link>}
                <button type="button" disabled={pending} className={actionClass}
                  aria-label={`${item.is_read ? "Marcar como não lida" : "Marcar como lida"}: ${item.title}`}
                  onClick={() => { resetErrors(); actions.setRead.mutate({ id: item.id, isRead: !item.is_read }); }}>
                  {item.is_read ? "Marcar como não lida" : "Marcar como lida"}
                </button>
                <button type="button" disabled={pending} aria-label={`Dispensar notificação: ${item.title}`}
                  className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error disabled:opacity-50"
                  onClick={() => { resetErrors(); actions.dismiss.mutate(item.id); }}>
                  <MaterialIcon icon="close" size={16} />
                </button>
              </div>
            </div>
          </li>;
        })}
      </ul>}
      {onPageChange && page && (offset > 0 || page.count > limit) && <nav aria-label="Paginação das notificações" className="flex items-center justify-between gap-3 border-t border-outline-variant/20 p-4 text-sm">
        <button type="button" disabled={offset === 0} className={actionClass} onClick={() => onPageChange(Math.max(0, offset - limit))}>Anteriores</button>
        <span className="text-on-surface-variant">Página {Math.floor(offset / limit) + 1}</span>
        <button type="button" disabled={offset + limit >= page.count} className={actionClass} onClick={() => onPageChange(offset + limit)}>Próximas</button>
      </nav>}
    </div>
  );
}
