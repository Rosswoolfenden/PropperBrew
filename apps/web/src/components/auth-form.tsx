"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AccountType } from "@propperbrew/shared";
import { useSession } from "@/app/providers";
import { authMessage, MIN_PASSWORD, siteUrl } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Message = { tone: "error" | "info"; text: string; resend?: boolean };

/** Email + password sign-in, or account creation (confirmed by email), for coffee drinkers or roasters. */
export function AuthForm({ accountType, redirectTo }: { accountType: AccountType; redirectTo: string }) {
  const router = useRouter();
  const { session, ready } = useSession();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  // The confirmation link brings them back here, signed in.
  const confirmUrl = () => siteUrl(redirectTo);

  // Already signed in (or just signed in): carry on.
  useEffect(() => {
    if (ready && session) router.replace(redirectTo);
  }, [ready, session, redirectTo, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (mode === "signUp" && password.length < MIN_PASSWORD) {
      return setMessage({ tone: "error", text: `Use at least ${MIN_PASSWORD} characters for your password.` });
    }
    setBusy(true);
    const result =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { account_type: accountType }, emailRedirectTo: confirmUrl() } });
    setBusy(false);
    if (result.error) {
      return setMessage({ tone: "error", text: authMessage(result.error), resend: result.error.code === "email_not_confirmed" });
    }
    if (!result.data.session) {
      // The auth service answers the same for an address that's already registered, so this
      // doesn't reveal who has an account.
      setMessage({ tone: "info", text: `Check your email. We've sent a link to ${email} to confirm your account.`, resend: true });
    }
  };

  const resend = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmUrl() } });
    setBusy(false);
    setMessage(error ? { tone: "error", text: authMessage(error) } : { tone: "info", text: `Sent again. Check ${email} for the link.` });
  };

  const signUp = mode === "signUp";
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label className="field">
        <span className="eyebrow">Email address</span>
        <input type="email" autoComplete="email" placeholder="your@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span className="eyebrow">Password</span>
        <input
          type="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          placeholder="••••••••"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {!signUp && (
        <Link className="text-button forgot-link" href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}>
          Forgot your password?
        </Link>
      )}
      {message && (
        <div className={`alert alert-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
          {message.resend && (
            <>
              {" "}
              <button type="button" className="text-button" disabled={busy} onClick={resend}>
                Resend the email
              </button>
            </>
          )}
        </div>
      )}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "One moment…" : signUp ? (accountType === "business" ? "Create business account" : "Create account") : "Sign in"}
      </button>
      <p className="auth-switch">
        <span className="muted italic">{signUp ? "Already have an account?" : accountType === "business" ? "New to PropperBrew?" : "New to the club?"}</span>
        <button type="button" className="text-button" onClick={() => (setMode(signUp ? "signIn" : "signUp"), setMessage(null))}>
          {signUp ? "Sign in" : "Create account"}
        </button>
      </p>
    </form>
  );
}
