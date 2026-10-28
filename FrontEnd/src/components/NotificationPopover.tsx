import { useState } from "react";
import { Link } from "react-router";
import { Popover } from "radix-ui";
import MaterialIcon from "@/components/MaterialIcon";
import { useAuth } from "@/contexts/useAuth";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { notificationDashboard } from "@/features/notifications/types/notification";

function AuthenticatedBell() {
  const { userRole } = useAuth();
  const [open, setOpen] = useState(false);
  const query = useNotifications();
  const unread = query.data?.unread_count ?? 0;

  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild>
      <button type="button" aria-label={unread ? `Notificações, ${unread} não lidas` : "Notificações"}
        className="relative p-1 text-on-surface-variant transition-colors hover:text-primary">
        <MaterialIcon icon="notifications" size={24} />
        {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface-container-lowest bg-error px-0.5 text-[10px] font-bold text-on-primary">{unread > 99 ? "99+" : unread}</span>}
        {query.isError && <span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-error px-1 text-xs font-bold text-on-primary">!</span>}
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="end" sideOffset={8} collisionPadding={12} aria-label="Central de notificações"
        className="z-[100] w-[min(26rem,calc(100vw-24px))] max-h-[calc(100dvh-100px)] overflow-y-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest text-on-surface shadow-xl">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-headline font-bold">Notificações</h2>
          <Popover.Close aria-label="Fechar notificações" className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-high"><MaterialIcon icon="close" size={20} /></Popover.Close>
        </div>
        <NotificationList compact onOpen={() => setOpen(false)} />
        <div className="border-t border-outline-variant/30 p-3 text-center">
          <Link to={`${notificationDashboard(userRole)}?tab=notificacoes`} onClick={() => setOpen(false)}
            className="inline-block py-1 text-sm font-bold text-primary hover:underline">Ver todas as notificações</Link>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

export default function NotificationPopover() {
  const { userId, isAuthenticated, isLoading } = useAuth();
  return isAuthenticated && !isLoading && userId ? <AuthenticatedBell key={userId} /> : null;
}
