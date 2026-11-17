/**
 * A stand-in for Expo's push service in the tests: it accepts pushes the way Expo does and keeps
 * them for tests to read at GET /__pushes. The API reaches it through EXPO_PUSH_URL.
 */
import { createServer } from "node:http";
import { ports } from "./fixtures";

const pushes: Record<string, unknown>[] = [];

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${ports.fakePush}`);
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/health") return reply(200, { ok: true });
  if (url.pathname === "/__pushes") return reply(200, pushes);
  if (req.method === "POST" && url.pathname === "/push/send") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const message = JSON.parse(body) as Record<string, unknown>;
      pushes.push(message);
      reply(200, { data: { status: "ok", id: `ticket-${pushes.length}` } });
    });
    return;
  }
  reply(404, { error: "fake push has no " + url.pathname });
}).listen(ports.fakePush, () => console.info(`Fake push on :${ports.fakePush}`));
