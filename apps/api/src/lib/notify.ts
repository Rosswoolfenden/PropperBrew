import { inArray } from "drizzle-orm";
import { notifications, profiles, type Db } from "@propperbrew/db";
import type { NotificationKind } from "@propperbrew/shared";
import { sendExpoPush } from "./push";

type Notice = { kind: NotificationKind; title: string; body: string; path: string };

/**
 * Tell people something: it goes in their in-app notifications, and to their phone if it has
 * registered for push. A failed push never stops the rest (the notification is saved either way).
 */
export async function notify(db: Db, userIds: string[], notice: Notice) {
  if (userIds.length === 0) return;
  await db.insert(notifications).values(userIds.map((userId) => ({ userId, ...notice })));
  const phones = await db.query.profiles.findMany({ where: inArray(profiles.id, userIds), columns: { expoPushToken: true } });
  for (const { expoPushToken } of phones) {
    if (!expoPushToken) continue;
    await sendExpoPush(expoPushToken, { title: notice.title, body: notice.body, data: { path: notice.path } }).catch((err) =>
      console.warn("Push failed:", err),
    );
  }
}

export const notifyOne = (db: Db, userId: string, notice: Notice) => notify(db, [userId], notice);
