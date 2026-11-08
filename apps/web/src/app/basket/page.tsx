import type { Metadata } from "next";
import { BasketView } from "@/components/basket-view";
import { SignedIn } from "@/components/signed-in";

export const metadata: Metadata = { title: "Your basket" };

export default function BasketPage() {
  return (
    <>
      <section className="intro">
        <h1 className="display">Your Selection</h1>
        <p className="eyebrow">Coffees from independent roasters, in one checkout</p>
      </section>
      <SignedIn prompt="Sign in to see your basket.">
        <BasketView />
      </SignedIn>
    </>
  );
}
