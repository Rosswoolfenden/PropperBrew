import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { userFromAuthHeader, type AuthUser } from "../lib/auth";
import { db } from "../lib/db";
import { rateLimiter } from "../lib/rate-limit";

export async function createContext({ req }: { req: Request }) {
  const user = await userFromAuthHeader(req.headers.get("authorization"));
  return { db, user };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user as AuthUser } });
});

/**
 * A signed-in action that's costly or sensitive (paying, scanning with Claude, posting): each
 * person may do it at most `perMinute` times a minute.
 */
export function limitedProcedure(action: string, perMinute: number) {
  const allow = rateLimiter(perMinute);
  return protectedProcedure.use(({ ctx, next }) => {
    if (!allow(`${action}:${ctx.user.id}`)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You're going a bit fast. Try again in a minute." });
    }
    return next();
  });
}
