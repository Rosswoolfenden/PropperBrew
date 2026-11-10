import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { uploads, type Db } from "@propperbrew/db";
import type { UploadKind } from "@propperbrew/shared";

/**
 * A photo URL someone wants to attach must be one they uploaded, for that purpose. Stops a
 * profile, review or roaster page pointing at someone else's photo, or anywhere on the web.
 */
export async function assertOwnUpload(db: Db, userIds: string | string[], url: string, kind: UploadKind) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  for (const userId of ids) {
    const found = await db.query.uploads.findFirst({ where: and(eq(uploads.url, url), eq(uploads.userId, userId), eq(uploads.kind, kind)), columns: { id: true } });
    if (found) return;
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Upload the photo first." });
}
