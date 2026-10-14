import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@propperbrew/api/router";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Server-side client for Server Components (public data only). */
export const api = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${apiUrl}/trpc`, transformer: superjson })],
});
