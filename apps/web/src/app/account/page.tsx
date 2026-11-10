import type { Metadata } from "next";
import { AccountSettings } from "@/components/account-settings";
import { SignedIn } from "@/components/signed-in";

export const metadata: Metadata = { title: "Account settings", robots: { index: false } };

export default function AccountPage() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">Account</p>
        <h1 className="display">Account settings</h1>
      </section>
      <SignedIn prompt="Sign in to manage your account.">
        <AccountSettings />
      </SignedIn>
    </>
  );
}
