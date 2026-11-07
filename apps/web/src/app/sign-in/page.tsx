import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** Only same-site paths, so a crafted link can't send people elsewhere after signing in. */
const safeNext = (next: string | undefined) => (next && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : "/");

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <section className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">Welcome back</p>
        <h1 className="display">The Ritual Awaits</h1>
        <p className="lead italic">Enter your details to reconnect with your daily brew.</p>
      </div>
      <AuthForm accountType="consumer" redirectTo={safeNext(next)} />
    </section>
  );
}
