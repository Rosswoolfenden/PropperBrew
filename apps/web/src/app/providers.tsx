"use client";

import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import superjson from "superjson";
import type { AppRouter } from "@propperbrew/api/router";
import { supabase } from "@/lib/supabase";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/** `ready` is false until the stored session (or one arriving in a sign-in link) has been read. */
const SessionContext = createContext<{ session: Session | null; ready: boolean }>({ session: null, ready: false });
export const useSession = () => useContext(SessionContext);

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${apiUrl}/trpc`,
          transformer: superjson,
          async headers() {
            const { data } = await supabase.auth.getSession();
            return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
          },
        }),
      ],
    }),
  );
  const [auth, setAuth] = useState<{ session: Session | null; ready: boolean }>({ session: null, ready: false });

  useEffect(() => {
    // Fires once with the current session (INITIAL_SESSION), then on every change.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setAuth({ session, ready: true });
      // Per-person data (your account, your roasters) changes with who's signed in.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <SessionContext.Provider value={auth}>{children}</SessionContext.Provider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
