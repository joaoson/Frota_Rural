import MaterialIcon from "@/components/MaterialIcon";
import type { ChatThread } from "@/services/ChatService/models/ChatModels";

interface Props {
  threads: ChatThread[];
  activeId?: string;
  loading: boolean;
  onSelect: (thread: ChatThread) => void;
}

function preview(thread: ChatThread) {
  const last = thread.last_message;
  if (!last) return "Nenhuma mensagem ainda";
  if (last.hidden) return "Mensagem removida pela moderação.";
  return last.content ?? "";
}

export default function ThreadList({ threads, activeId, loading, onSelect }: Props) {
  if (loading) {
    return <p className="p-4 text-sm text-on-surface-variant">Carregando conversas...</p>;
  }
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-on-surface-variant">
        <MaterialIcon icon="forum" size={32} />
        <p className="text-sm">Nenhuma conversa ainda.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-outline-variant/30">
      {threads.map((thread) => {
        const active = thread.thread_id === activeId;
        return (
          <li key={thread.thread_id}>
            <button
              type="button"
              onClick={() => onSelect(thread)}
              className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${
                active ? "bg-surface-container" : "hover:bg-surface-container-low"
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {(thread.peer?.name ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-on-surface">
                    {thread.peer?.name ?? "Usuário"}
                  </span>
                  {thread.unread_count > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-primary">
                      {thread.unread_count > 9 ? "9+" : thread.unread_count}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-on-surface-variant">
                  {thread.scope_label}
                </span>
                <span className="block truncate text-xs text-on-surface-variant/80">
                  {preview(thread)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
