"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/app/providers";

/** Renders `children` for signed-in people; everyone else is asked to sign in and brought back. */
export function SignedIn({ prompt, children }: { prompt: string; children: ReactNode }) {
  const { session, ready } = useSession();
  const pathname = usePathname();
  if (!ready) return <p className="muted">Loading…</p>;
  if (!session) {
    return (
      <div className="review-cta">
        <p className="muted">{prompt}</p>
        <Link className="button" href={`/sign-in?next=${encodeURIComponent(pathname)}`}>
          Sign in
        </Link>
      </div>
    );
  }
  return children;
}
