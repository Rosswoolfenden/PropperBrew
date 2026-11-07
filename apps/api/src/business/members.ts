import { and, eq } from "drizzle-orm";
import { profiles, roasterMembers, type Db } from "@propperbrew/db";
import type { RoasterRole } from "@propperbrew/shared";

/**
 * Adds a person to a roaster's team, after Shopify has confirmed they run its store: as owner if
 * the roaster has none yet, otherwise as staff. Their account becomes a business account.
 */
export function joinRoaster(db: Db, roasterId: string, userId: string): Promise<RoasterRole> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.roasterMembers.findFirst({
      where: and(eq(roasterMembers.roasterId, roasterId), eq(roasterMembers.userId, userId)),
    });
    await tx.update(profiles).set({ accountType: "business" }).where(eq(profiles.id, userId));
    if (existing) return existing.role;

    const owner = await tx.query.roasterMembers.findFirst({
      where: and(eq(roasterMembers.roasterId, roasterId), eq(roasterMembers.role, "owner")),
    });
    const role: RoasterRole = owner ? "staff" : "owner";
    await tx.insert(roasterMembers).values({ roasterId, userId, role }).onConflictDoNothing();
    return role;
  });
}
