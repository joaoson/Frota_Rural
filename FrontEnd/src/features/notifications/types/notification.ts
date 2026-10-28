import { z } from "zod";

export const notificationKindSchema = z.enum(["rental", "payment", "contract"]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z.object({
  id: z.string(),
  kind: notificationKindSchema,
  title: z.string(),
  message: z.string(),
  is_read: z.boolean(),
  created_at: z.iso.datetime({ offset: true }),
  read_at: z.iso.datetime({ offset: true }).nullable(),
  rental: z.string().nullable(),
  posting: z.string().nullable(),
  contract: z.string().nullable(),
});
export const notificationPageSchema = z.object({
  results: notificationSchema.array(),
  count: z.number().int().nonnegative(),
  unread_count: z.number().int().nonnegative(),
});
export const notificationsReadAllSchema = z.object({
  updated: z.number().int().nonnegative(),
  unread_count: z.number().int().nonnegative(),
});

export type PlatformNotification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;
export interface NotificationFilter {
  limit?: number;
  offset?: number;
  kind?: NotificationKind;
  unread?: boolean;
}

export const notificationKinds = {
  rental: { label: "Locação", icon: "event_available" },
  payment: { label: "Pagamento", icon: "payments" },
  contract: { label: "Contrato", icon: "description" },
} as const;

export function notificationDashboard(role: string | null): string {
  return role === "locatario" ? "/dashboard-locatario" : "/dashboard";
}

/** References stay local; the API cannot inject an external destination. */
export function notificationDestination(item: PlatformNotification, role: string | null): string | null {
  if (item.kind === "contract" && item.contract) return `/contrato/${encodeURIComponent(item.contract)}`;
  if (!item.rental) return null;
  const tab = role === "locatario" ? "locacoes" : "reservas";
  return `${notificationDashboard(role)}?tab=${tab}#locacao-${encodeURIComponent(item.rental)}`;
}
