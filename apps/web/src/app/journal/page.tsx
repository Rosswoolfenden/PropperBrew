import type { Metadata } from "next";
import { JournalView } from "@/components/journal-view";
import { SignedIn } from "@/components/signed-in";

export const metadata: Metadata = { title: "Your journal", robots: { index: false } };

export default function JournalPage() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">Journal</p>
        <h1 className="display">Your journal</h1>
      </section>
      <SignedIn prompt="Sign in to see your shelf and your brews.">
        <JournalView />
      </SignedIn>
    </>
  );
}
