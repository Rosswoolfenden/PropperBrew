"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession } from "@/app/providers";
import { authMessage, MIN_PASSWORD, siteUrl } from "@/lib/auth";
import { arrivedFromResetLink, initialLinkError, supabase } from "@/lib/supabase";

/** Ask for a reset link. The reply is the same whether or not there's an account, so it can't be used to find accounts. */
export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter the email address you signed up with.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl("/reset-password") });
    setBusy(false);
    if (error) return setError(authMessage(error));
    setSent(email.trim());
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate aria-label="Reset your password">
      <label className="field">
        <span className="eyebrow">Email address</span>
        <input type="email" autoComplete="email" placeholder="your@email.com" value={email} onChange={(e) => (setEmail(e.target.value), setSent(null))} />
      </label>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      {sent && (
        <p className="alert alert-info" role="status">
          If there&apos;s an account for {sent}, we&apos;ve sent it a link to reset the password. It works for an hour.
        </p>
      )}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Sending…" : sent ? "Send again" : "Send reset link"}
      </button>
      <p className="auth-switch">
        <span className="muted italic">Remembered it?</span>
        <Link href="/sign-in" className="text-button">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/**
 * Where the reset email lands: the link signs them in for this one purpose, then they choose a new
 * password. An expired or used link lands here with the reason instead.
 */
export function ResetPasswordForm() {
  const { session, ready } = useSession();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <p className="muted">One moment…</p>;
  if (session && !arrivedFromResetLink) {
    // Already signed in normally: changing the password needs the current one (account settings).
    return (
      <div className="auth-form">
        <p className="muted">You&apos;re signed in as {session.user.email}.</p>
        <Link href="/account" className="button">
          Change your password in account settings
        </Link>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="auth-form">
        <p className="alert alert-error" role="alert">
          {initialLinkError ?? "Open this page from the link in your reset email."}
        </p>
        <Link href="/forgot-password" className="button">
          Send a new link
        </Link>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    if (password !== confirm) return setError("Those passwords don't match.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authMessage(error));
    router.replace("/account?password=changed");
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate aria-label="Choose a new password">
      <p className="muted">For {session.user.email}</p>
      <label className="field">
        <span className="eyebrow">New password</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="field">
        <span className="eyebrow">Type it again</span>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
