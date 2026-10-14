import type { HttpClient } from "@/shared/http/HttpClient";
import {
  notificationPageSchema, notificationSchema, notificationsReadAllSchema,
  type NotificationFilter, type NotificationPage, type PlatformNotification,
} from "../types/notification";

export interface NotificationRepository {
  list(filter: NotificationFilter, signal?: AbortSignal): Promise<NotificationPage>;
  setRead(id: string, isRead: boolean): Promise<PlatformNotification>;
  dismiss(id: string): Promise<void>;
  readAll(): Promise<void>;
}

export class HttpNotificationRepository implements NotificationRepository {
  private readonly http: HttpClient;
  constructor(http: HttpClient) { this.http = http; }

  async list(filter: NotificationFilter, signal?: AbortSignal): Promise<NotificationPage> {
    const response = await this.http.send<unknown>({ method: "GET", path: "notifications/", query: { ...filter }, signal });
    return notificationPageSchema.parse(response.data);
  }

  async setRead(id: string, isRead: boolean): Promise<PlatformNotification> {
    const response = await this.http.send<unknown>({ method: "PATCH", path: `notifications/${encodeURIComponent(id)}`, body: { is_read: isRead } });
    return notificationSchema.parse(response.data);
  }

  async dismiss(id: string): Promise<void> {
    await this.http.send({ method: "DELETE", path: `notifications/${encodeURIComponent(id)}` });
  }

  async readAll(): Promise<void> {
    const response = await this.http.send<unknown>({ method: "POST", path: "notifications/read-all", body: {} });
    notificationsReadAllSchema.parse(response.data);
  }
}
