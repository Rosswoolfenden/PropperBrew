import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { userFromAuthHeader, type AuthUser } from "../lib/auth";
import { db } from "../lib/db";

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
