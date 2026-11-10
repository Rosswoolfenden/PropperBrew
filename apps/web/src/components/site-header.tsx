"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, useTRPC } from "@/app/providers";
import { signOut as endSession } from "@/lib/supabase";
import { AuthNotice } from "./auth-notice";

/** The banner across every page: the brand, and sign-in for coffee drinkers and for roasters. */
export function SiteHeader() {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  // The profile is the source of truth for whether this is a business account.
  const me = useQuery({ ...trpc.me.get.queryOptions(), enabled: !!session });
  const checkout = useQuery(trpc.basket.enabled.queryOptions());
  const basket = useQuery({ ...trpc.basket.get.queryOptions(), enabled: !!session && checkout.data === true });
  const count = basket.data?.count ?? 0;

  const signOut = async () => {
    await endSession();
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
              {checkout.data && (
                <Link href="/basket" className="nav-link nav-basket" aria-label={`Basket, ${count} ${count === 1 ? "item" : "items"}`}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path fill="currentColor" d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2m6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2z" />
                  </svg>
                  {count > 0 && <span className="basket-count">{count}</span>}
                </Link>
              )}
              {me.data ? (
                <Link
                  href={`/u/${me.data.username}`}
                  className="nav-link nav-user"
                  title={session.user.email}
                  aria-label={me.data.displayName ?? me.data.username}
                >
                  {/* Phones show just the icon. */}
                  <svg className="nav-user-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4m0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4" />
                  </svg>
                  <span className="nav-user-name">{me.data.displayName ?? me.data.username}</span>
                </Link>
              ) : (
                <span className="nav-user">{session.user.email}</span>
              )}
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
      <AuthNotice />
    </header>
  );
}
