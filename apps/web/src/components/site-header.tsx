"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, useTRPC } from "@/app/providers";
import { supabase } from "@/lib/supabase";

/** The banner across every page: the brand, and sign-in for coffee drinkers and for roasters. */
export function SiteHeader() {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  // The profile is the source of truth for whether this is a business account.
  const me = useQuery({ ...trpc.me.get.queryOptions(), enabled: !!session });

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="logo">
          PropperBrew
        </Link>
        {/* Nothing until we know who's here, so signed-in people never see "Sign in" flash. */}
        <nav className="site-nav" aria-label="Account">
          {!ready ? null : session ? (
            <>
              {me.data?.accountType === "business" && (
                <Link href="/business/dashboard" className="nav-link">
                  Dashboard
                </Link>
              )}
              <span className="nav-user" title={session.user.email}>
                {me.data?.username ?? session.user.email}
              </span>
              <button type="button" className="nav-link" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/business" className="nav-link">
                For roasters
              </Link>
              <Link href="/sign-in" className="button button-sm">
                Sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
