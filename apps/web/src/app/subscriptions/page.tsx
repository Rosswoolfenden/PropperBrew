import type { Metadata } from "next";
import { SignedIn } from "@/components/signed-in";
import { SubscriptionsView } from "@/components/subscriptions-view";

export const metadata: Metadata = { title: "Your subscriptions", robots: { index: false } };

export default function SubscriptionsPage() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">Subscriptions</p>
        <h1 className="display">Your subscriptions</h1>
      </section>
      <SignedIn prompt="Sign in to see your subscriptions.">
        <SubscriptionsView />
      </SignedIn>
    </>
  );
}
