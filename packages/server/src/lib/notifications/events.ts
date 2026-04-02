import { db } from '../../db/index.js';
import { notificationEvents } from '../../db/schema/notification-events.js';

export interface NotificationEventRecord {
  channel: 'telegram';
  eventType: string;
  message: string;
  success: boolean;
  error?: string | null;
  saleId?: number | null;
  cardId?: number | null;
  tcgplayerOrderId?: string | null;
}

export async function recordNotificationEvent(
  event: NotificationEventRecord,
): Promise<void> {
  try {
    await db.insert(notificationEvents).values({
      channel: event.channel,
      eventType: event.eventType,
      message: event.message,
      success: event.success,
      error: event.error ?? null,
      saleId: event.saleId ?? null,
      cardId: event.cardId ?? null,
      tcgplayerOrderId: event.tcgplayerOrderId ?? null,
    });
  } catch {
    // Best-effort only: notification event logging must never break callers.
  }
}
