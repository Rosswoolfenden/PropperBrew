"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AccountType } from "@propperbrew/shared";
import { useSession } from "@/app/providers";
import { supabase } from "@/lib/supabase";

const MIN_PASSWORD = 8;

/** Email + password sign-in, or account creation, for coffee drinkers or roasters. */
export function AuthForm({ accountType, redirectTo }: { accountType: AccountType; redirectTo: string }) {
  const router = useRouter();
  const { session, ready } = useSession();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

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
        : await supabase.auth.signUp({ email, password, options: { data: { account_type: accountType } } });
    setBusy(false);
    if (result.error) {
      const text =
        result.error.code === "invalid_credentials"
          ? "That email and password don't match an account."
          : result.error.code === "user_already_exists"
            ? "There's already an account with that email. Sign in instead."
            : result.error.message;
      return setMessage({ tone: "error", text });
    }
    // With email confirmation on (as in production), sign-up returns no session yet.
    if (!result.data.session) setMessage({ tone: "info", text: "Check your email to confirm your account, then sign in." });
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
      {message && (
        <p className={`alert alert-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
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
