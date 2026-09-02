import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { chatService } from "@/services/ChatService/ChatService";
import type { UnreadCounts } from "@/services/ChatService/models/ChatModels";

interface ChatUnreadValue extends UnreadCounts {
  setUnread: (counts: UnreadCounts) => void;
  refresh: () => Promise<void>;
}

const ChatUnreadContext = createContext<ChatUnreadValue | undefined>(undefined);

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>({ unread_total: 0, unread_threads: 0 });

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setCounts(await chatService.getUnread());
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [isAuthenticated, isLoading, refresh]);

  // Deslogado sempre lê zero, sem precisar de um setState no efeito só para
  // limpar o estado antigo.
  const value = useMemo(
    () => ({
      unread_total: isAuthenticated ? counts.unread_total : 0,
      unread_threads: isAuthenticated ? counts.unread_threads : 0,
      setUnread: setCounts,
      refresh,
    }),
    [counts, refresh, isAuthenticated],
  );
  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread() {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) throw new Error("useChatUnread precisa estar dentro de ChatUnreadProvider");
  return ctx;
}
