import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

/** Where confirmation links from the app land: confirmed, and signed in here too. */
export default function WelcomePage() {
  return (
    <section className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">Email confirmed</p>
        <h1 className="display">Welcome to PropperBrew</h1>
        <p className="lead italic">Your account is ready. Head back to the app and sign in with the same email and password.</p>
      </div>
      <Link href="/" className="button">
        Explore the website
      </Link>
    </section>
  );
}
