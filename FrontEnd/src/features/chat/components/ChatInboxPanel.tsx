import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";

import type { ChatThread } from "@/features/chat/types/chat";
import { useChatActions } from "@/features/chat/hooks/useChat";

/**
 * Inbox real, compartilhado pelos dois dashboards.
 *
 * Substitui os mocks que existiam duplicados em DashboardLocador e
 * DashboardLocatario. A conversa em si mora em /mensagens/:threadId — manter
 * uma única implementação da thread evita que as duas cópias divirjam.
 */
export default function ChatInboxPanel({ subtitle }: { subtitle: string }) {
  const chat = useChatActions();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    try {
      const page = await chat.listThreads({ limit: 50 });
      setThreads(page.results);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as conversas.");
    } finally {
      setLoading(false);
    }
  }, [chat]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtradas = threads.filter((t) => {
    const alvo = `${t.peer?.name ?? ""} ${t.scopeLabel}`.toLowerCase();
    return alvo.includes(busca.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">
          Mensagens
        </h1>
        <div className="h-1 w-16 bg-secondary-container mt-2" />
        <p className="text-on-surface-variant text-sm mt-3">{subtitle}</p>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-outline-variant/30">
          <div className="relative">
            <MaterialIcon
              icon="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-outline"
              size={18}
            />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full bg-surface-container border-none rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/50 text-on-surface"
            />
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-on-surface-variant">Carregando conversas...</p>
        ) : erro ? (
          <div className="p-6">
            <p className="text-sm text-error">{erro}</p>
            <button
              type="button"
              onClick={() => void carregar()}
              className="mt-2 text-sm font-bold text-primary hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-on-surface-variant">
            <MaterialIcon icon="forum" size={32} />
            <p className="text-sm">
              {threads.length === 0
                ? "Nenhuma conversa ainda. Abra um anúncio e fale com o outro lado."
                : "Nenhuma conversa corresponde à busca."}
            </p>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
            {filtradas.map((t) => (
              <button
                key={t.threadId}
                type="button"
                onClick={() => navigate(`/mensagens/${encodeURIComponent(t.threadId)}`)}
                className="w-full p-4 flex items-center gap-3 hover:bg-surface-container-high transition-colors border-b border-outline-variant/20 text-left"
              >
                <div className="w-11 h-11 bg-primary-container text-on-primary rounded-full flex items-center justify-center font-headline font-bold text-sm shrink-0">
                  {(t.peer?.name ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-bold text-on-surface text-sm truncate">
                      {t.peer?.name ?? "Usuário"}
                    </span>
                    <span className="text-[11px] text-on-surface-variant shrink-0">
                      {t.lastMessage
                        ? new Date(t.lastMessage.sentAt).toLocaleDateString("pt-BR")
                        : ""}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant truncate">{t.scopeLabel}</p>
                  <p className="text-sm text-on-surface-variant/80 truncate">
                    {t.lastMessage
                      ? t.lastMessage.hidden
                        ? "Mensagem removida pela moderação."
                        : t.lastMessage.content
                      : "Nenhuma mensagem ainda"}
                  </p>
                </div>
                {t.unreadCount > 0 ? (
                  <span className="w-5 h-5 bg-primary text-on-primary rounded-full text-[10px] font-bold flex items-center justify-center shrink-0">
                    {t.unreadCount > 9 ? "9+" : t.unreadCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
