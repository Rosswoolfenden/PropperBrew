import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <section className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">Forgotten your password?</p>
        <h1 className="display">Reset your password</h1>
        <p className="lead italic">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <ForgotPasswordForm initialEmail={email ?? ""} />
    </section>
  );
}
