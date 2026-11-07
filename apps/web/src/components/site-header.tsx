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
          <Link href="/search" className="nav-link nav-search" aria-label="Search">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14" />
            </svg>
            <span className="nav-search-label">Search</span>
          </Link>
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
