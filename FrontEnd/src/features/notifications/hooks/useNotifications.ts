import { useMutation, useQuery } from "@tanstack/react-query";
import { notificationStore } from "@/app/container";
import { useAuth } from "@/contexts/useAuth";
import type { NotificationFilter } from "../types/notification";

export function useNotifications(filter: NotificationFilter = {}) {
  const { userId, isAuthenticated, isLoading } = useAuth();
  const ready = isAuthenticated && !isLoading && Boolean(userId);
  return useQuery({
    ...notificationStore.listOptions(ready ? userId! : "", filter),
    enabled: ready,
  });
}

export function useNotificationActions() {
  const { userId, isAuthenticated, isLoading } = useAuth();
  const currentUser = () => {
    if (!userId || !isAuthenticated || isLoading) throw new Error("Entre na sua conta para acessar as notificações.");
    return userId;
  };
  const setRead = useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) => notificationStore.setRead(currentUser(), id, isRead),
  });
  const dismiss = useMutation({ mutationFn: (id: string) => notificationStore.dismiss(currentUser(), id) });
  const readAll = useMutation({ mutationFn: () => notificationStore.readAll(currentUser()) });
  return { setRead, dismiss, readAll };
}
