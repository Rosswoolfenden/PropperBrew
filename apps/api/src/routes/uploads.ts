import { randomUUID } from "node:crypto";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { relative } from "node:path";
import { uploads } from "@propperbrew/db";
import { MAX_UPLOAD_BYTES, UPLOAD_KINDS, type UploadKind } from "@propperbrew/shared";
import { userFromAuthHeader } from "../lib/auth";
import { db } from "../lib/db";
import { rateLimiter } from "../lib/rate-limit";
import { NotAnImage, processImage } from "../uploads/images";
import { localUploadsRoot, putObject } from "../uploads/store";

export const uploadRoutes = new Hono();
const allow = rateLimiter(30);

/**
 * Upload a photo (multipart, field "file"; `?kind=avatar|review|logo`). Signed-in only. Returns its
 * URL, which the person can then attach to their profile, a review or their roaster's page.
 */
// Browsers send a preflight first (the upload carries an Authorization header).
uploadRoutes.use("/uploads", cors({ origin: (origin) => origin }));

uploadRoutes.post(
  "/uploads",
  bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: (c) => c.json({ error: "That photo is too big. Use one under 10 MB." }, 413) }),
  async (c) => {
    const user = await userFromAuthHeader(c.req.header("authorization"));
    if (!user) return c.json({ error: "Sign in to upload photos." }, 401);
    const kind = c.req.query("kind") as UploadKind;
    if (!UPLOAD_KINDS.includes(kind)) return c.json({ error: "Unknown kind of photo." }, 400);
    if (!allow(`upload:${user.id}`)) return c.json({ error: "You're going a bit fast. Try again in a minute." }, 429);

    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return c.json({ error: "Choose a photo to upload." }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "That photo is too big. Use one under 10 MB." }, 413);

    let image;
    try {
      image = await processImage(Buffer.from(await file.arrayBuffer()), kind);
    } catch (err) {
      if (err instanceof NotAnImage) return c.json({ error: err.message }, 415);
      throw err;
    }
    const url = await putObject(`${kind}/${user.id}/${randomUUID()}.webp`, image.bytes, image.contentType);
    await db.insert(uploads).values({ userId: user.id, kind, url });
    return c.json({ url, width: image.width, height: image.height });
  },
);

// Local driver: the API serves the photos itself. Names are random and never change, so cache for good.
const root = localUploadsRoot();
if (root) {
  uploadRoutes.use(
    "/uploads/*",
    serveStatic({
      root: relative(process.cwd(), root),
      rewriteRequestPath: (path) => path.replace(/^\/uploads/, ""),
      onFound: (_path, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
    }),
  );
}
