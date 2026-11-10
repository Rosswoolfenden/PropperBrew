"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/app/providers";
import { initialLinkError } from "@/lib/supabase";

/** One line under the banner when sign-in state changed without them asking: a session ran out, or an account was deleted. */
export function AuthNotice() {
  const { expired, session } = useSession();
  const pathname = usePathname();
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("account") === "deleted") {
      setDeleted(true);
      url.searchParams.delete("account");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [pathname]);

  // The reset page explains a bad link itself.
  if (initialLinkError && !session && pathname !== "/reset-password") {
    return (
      <p className="auth-notice" role="alert">
        {initialLinkError} <Link href="/sign-in">Sign in</Link> or <Link href="/forgot-password">reset your password</Link>.
      </p>
    );
  }
  if (deleted) {
    return (
      <p className="auth-notice" role="status">
        Your account has been deleted. Thank you for brewing with us.
      </p>
    );
  }
  if (expired && !session && pathname !== "/sign-in") {
    return (
      <p className="auth-notice" role="status">
        You&apos;ve been signed out. <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in again</Link> to carry on.
      </p>
    );
  }
  return null;
}
