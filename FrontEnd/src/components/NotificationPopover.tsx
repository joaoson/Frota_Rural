import { useEffect, useRef, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";

interface Notification {
  id: number;
  icon: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
}

interface NotificationPopoverProps {
  notifications: Notification[];
}

const NotificationPopover = ({ notifications }: NotificationPopoverProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative text-on-surface-variant hover:text-primary transition-colors">
        <MaterialIcon icon="notifications" size={24} />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-error text-on-primary rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-surface-container-lowest">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-2 w-96 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between">
            <h3 className="font-headline font-bold text-on-surface">Notificações</h3>
            <span className="text-xs font-bold text-primary">{unreadCount} novas</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <button
                key={n.id}
                className={`w-full p-4 flex items-start gap-3 hover:bg-surface-container-high transition-colors border-b border-outline-variant/10 text-left ${
                  n.unread ? "bg-primary/5" : ""
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${n.unread ? "bg-primary/10" : "bg-surface-container-high"}`}>
                  <MaterialIcon icon={n.icon} className={n.unread ? "text-primary" : "text-on-surface-variant"} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-on-surface">{n.title}</div>
                  <div className="text-sm text-on-surface-variant truncate">{n.desc}</div>
                  <div className="text-[11px] text-outline mt-1">{n.time}</div>
                </div>
                {n.unread ? <span className="w-2.5 h-2.5 bg-primary rounded-full mt-1.5 shrink-0" /> : null}
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-outline-variant/30">
            <button className="w-full text-center text-sm font-bold text-primary hover:underline py-1">Ver todas as notificações</button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NotificationPopover;

