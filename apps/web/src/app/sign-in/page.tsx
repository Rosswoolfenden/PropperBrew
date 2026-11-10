import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

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
