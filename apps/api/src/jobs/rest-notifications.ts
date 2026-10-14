import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { profiles, shelfEntries } from "@propperbrew/db";
import { restState, restWindowDays } from "@propperbrew/shared";
import { db } from "../lib/db";
import { sendExpoPush } from "../lib/push";

/** "Your Guji has rested — it's at its best from today." */
export async function sendPeakNotifications(): Promise<void> {
  const due = await db.query.shelfEntries.findMany({
    where: and(isNotNull(shelfEntries.roastDate), isNull(shelfEntries.peakNotifiedAt), isNull(shelfEntries.finishedAt)),
    with: { bean: { columns: { id: true, name: true, roastLevel: true } } },
  });
  for (const entry of due) {
    const { state } = restState(entry.roastDate!, restWindowDays({ roastLevel: entry.bean.roastLevel }));
    if (state !== "peak") continue;
    const user = await db.query.profiles.findFirst({ where: eq(profiles.id, entry.userId) });
    if (user?.expoPushToken) {
      await sendExpoPush(user.expoPushToken, {
        title: "Ready to brew",
        body: `${entry.bean.name} has rested and is entering its peak window.`,
        data: { coffeeBeanId: entry.bean.id },
      });
    }
    await db.update(shelfEntries).set({ peakNotifiedAt: new Date() }).where(eq(shelfEntries.id, entry.id));
  }
}

export function startRestNotificationJob(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  const run = () => sendPeakNotifications().catch((err) => console.error("Peak notification job failed", err));
  run();
  return setInterval(run, intervalMs);
}
