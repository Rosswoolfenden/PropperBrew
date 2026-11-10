"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { DELETE_ACCOUNT_PHRASE } from "@propperbrew/shared";
import { useSession, useTRPC } from "@/app/providers";
import { authMessage, MIN_PASSWORD, siteUrl } from "@/lib/auth";
import { signOut, supabase } from "@/lib/supabase";

type Note = { tone: "error" | "info"; text: string } | null;

function Notice({ note }: { note: Note }) {
  if (!note) return null;
  return (
    <p className={`alert alert-${note.tone}`} role={note.tone === "error" ? "alert" : "status"}>
      {note.text}
    </p>
  );
}

function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card business-form ${className}`} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** Change email or password, sign out, or delete the account. */
export function AccountSettings() {
  const { session } = useSession();
  const email = session!.user.email ?? "";
  const [arrived, setArrived] = useState<"email" | "password" | null>(null);

  // Back from a confirmation or reset link. (The session's email updates as the link signs them in.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("email") === "changed") setArrived("email");
    if (params.get("password") === "changed") setArrived("password");
    if (params.size > 0) window.history.replaceState(null, "", "/account");
  }, []);

  return (
    <div className="account">
      <Notice
        note={arrived && { tone: "info", text: arrived === "email" ? `Your email is now ${email}.` : "Your password has been changed." }}
      />
      <ChangeEmail email={email} />
      <ChangePassword email={email} />
      <Section title="Sign out">
        <p className="muted">Signed in as {email}.</p>
        <SignOutButton />
      </Section>
      <DeleteAccount />
    </div>
  );
}

function SignOutButton() {
  const router = useRouter();
  return (
    <button type="button" className="button button-secondary" onClick={async () => (await signOut(), router.replace("/"))}>
      Sign out
    </button>
  );
}

function ChangeEmail({ email }: { email: string }) {
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const wanted = next.trim();
    if (!/^\S+@\S+\.\S+$/.test(wanted)) return setNote({ tone: "error", text: "Enter a valid email address." });
    if (wanted.toLowerCase() === email.toLowerCase()) return setNote({ tone: "error", text: "That's already your email address." });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: wanted }, { emailRedirectTo: siteUrl("/account?email=changed") });
    setBusy(false);
    if (error) return setNote({ tone: "error", text: authMessage(error) });
    setNote({ tone: "info", text: `Check ${wanted} for a link to confirm it. Until then, you sign in with ${email}.` });
    setNext("");
  };

  return (
    <Section title="Email address">
      <form onSubmit={submit} noValidate className="stack" aria-label="Change email">
        <p className="muted">You sign in with {email}.</p>
        <label className="field">
          <span className="eyebrow">New email address</span>
          <input type="email" autoComplete="email" value={next} onChange={(e) => (setNext(e.target.value), setNote(null))} />
        </label>
        <Notice note={note} />
        <button type="submit" className="button button-secondary" disabled={busy}>
          {busy ? "Sending…" : "Change email"}
        </button>
      </form>
    </Section>
  );
}

function ChangePassword({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setNote({ tone: "error", text: `Use at least ${MIN_PASSWORD} characters for your new password.` });
    setBusy(true);
    // Check it's really them before changing it.
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      return setNote({
        tone: "error",
        text: check.error.code === "invalid_credentials" ? "That's not your current password." : authMessage(check.error),
      });
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setNote({ tone: "error", text: authMessage(error) });
    setNote({ tone: "info", text: "Your password has been changed." });
    setCurrent("");
    setPassword("");
  };

  return (
    <Section title="Password">
      <form onSubmit={submit} noValidate className="stack" aria-label="Change password">
        <label className="field">
          <span className="eyebrow">Current password</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => (setCurrent(e.target.value), setNote(null))} />
        </label>
        <label className="field">
          <span className="eyebrow">New password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => (setPassword(e.target.value), setNote(null))} />
        </label>
        <p className="muted">Signed up with Shopify and never set a password? Sign out and use &ldquo;Forgot your password?&rdquo; to set one.</p>
        <Notice note={note} />
        <button type="submit" className="button button-secondary" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </Section>
  );
}

function DeleteAccount() {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const remove = useMutation(
    trpc.me.deleteAccount.mutationOptions({
      onSuccess: async () => {
        await signOut();
        router.replace("/?account=deleted");
      },
    }),
  );
  const ready = confirm.trim().toLowerCase() === DELETE_ACCOUNT_PHRASE;

  return (
    <Section title="Delete your account" className="danger-zone">
      <form
        onSubmit={(e) => (e.preventDefault(), ready && remove.mutate({ confirm }))}
        noValidate
        className="stack"
        aria-label="Delete account"
      >
        <p className="muted">
          This deletes your profile, reviews, recipes, votes, shelf and basket, and can&apos;t be undone. Orders you&apos;ve placed are kept for
          the roasters&apos; records, without your account.
        </p>
        <label className="field">
          <span className="eyebrow">Type &ldquo;{DELETE_ACCOUNT_PHRASE}&rdquo; to confirm</span>
          <input autoComplete="off" value={confirm} onChange={(e) => (setConfirm(e.target.value), remove.reset())} />
        </label>
        {remove.error && (
          <p className="alert alert-error" role="alert">
            {remove.error.message}
          </p>
        )}
        <button type="submit" className="button button-danger" disabled={!ready || remove.isPending}>
          {remove.isPending ? "Deleting…" : "Delete my account"}
        </button>
      </form>
    </Section>
  );
}
