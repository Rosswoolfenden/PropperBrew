import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";
import type { AppRouter } from "@propperbrew/api/router";

/** Server-side rendering can reach the API on a private address (API_URL); browsers use NEXT_PUBLIC_API_URL. */
const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Server-side client for Server Components (public data only). */
export const api = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${apiUrl}/trpc`, transformer: superjson })],
});

export type RouterOutputs = inferRouterOutputs<AppRouter>;
