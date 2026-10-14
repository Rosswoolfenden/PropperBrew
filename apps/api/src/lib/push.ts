/** Minimal Expo push sender. https://docs.expo.dev/push-notifications/sending-notifications/ */
export async function sendExpoPush(
  to: string,
  message: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ to, sound: "default", ...message }),
  });
  if (!res.ok) console.warn(`Expo push failed (${res.status}): ${await res.text()}`);
}
