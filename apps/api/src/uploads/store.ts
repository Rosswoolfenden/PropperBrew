import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env } from "../env";
import { serviceRoleToken } from "../lib/auth-admin";

const localRoot = () => resolve(env.UPLOADS_DIR);

/** Where a stored photo is served from. */
export function publicUrl(key: string) {
  return env.UPLOADS_DRIVER === "supabase"
    ? new URL(`/storage/v1/object/public/${env.UPLOADS_BUCKET}/${key}`, env.SUPABASE_URL).toString()
    : new URL(`/uploads/${key}`, env.PUBLIC_API_URL).toString();
}

/** The storage key of one of our photo URLs, or null if it isn't one. */
export function keyOf(url: string) {
  const prefix = publicUrl("");
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

export async function putObject(key: string, bytes: Buffer, contentType: string) {
  if (env.UPLOADS_DRIVER === "supabase") {
    const res = await fetch(new URL(`/storage/v1/object/${env.UPLOADS_BUCKET}/${key}`, env.SUPABASE_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${await serviceRoleToken()}`, "content-type": contentType, "cache-control": "max-age=31536000" },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
  } else {
    const path = join(localRoot(), key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  return publicUrl(key);
}

export async function removeObject(key: string) {
  if (env.UPLOADS_DRIVER === "supabase") {
    await fetch(new URL(`/storage/v1/object/${env.UPLOADS_BUCKET}/${key}`, env.SUPABASE_URL), {
      method: "DELETE",
      headers: { authorization: `Bearer ${await serviceRoleToken()}` },
    });
  } else {
    await rm(join(localRoot(), key), { force: true });
  }
}

/** The folder to serve at /uploads (local driver only). */
export const localUploadsRoot = () => (env.UPLOADS_DRIVER === "local" ? localRoot() : null);
