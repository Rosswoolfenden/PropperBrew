import type { Metadata } from "next";
import { SignedIn } from "@/components/signed-in";
import { SubscribeForm } from "@/components/subscribe-form";

export const metadata: Metadata = { title: "Subscribe", robots: { index: false } };

export default async function SubscribePage({ params }: { params: Promise<{ roaster: string; bean: string }> }) {
  const { roaster, bean } = await params;
  return (
    <SignedIn prompt="Sign in to subscribe.">
      <SubscribeForm roasterSlug={roaster} beanSlug={bean} />
    </SignedIn>
  );
}
