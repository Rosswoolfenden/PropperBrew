import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <section className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">Nearly there</p>
        <h1 className="display">Choose a new password</h1>
      </div>
      <ResetPasswordForm />
    </section>
  );
}
