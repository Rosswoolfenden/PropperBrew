import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { sessionEndedUnasked, signOut, supabase } from "./supabase";

export { signOut };

/** Where email links from the app (confirm your account, reset your password) land: the website. */
export const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000";

/** The signed-in Supabase session; `ready` is false until the stored session has been read. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  /** Their session ran out or was revoked (not a sign-out they asked for). */
  return { session, ready, expired: ready && !session && sessionEndedUnasked() };
}
