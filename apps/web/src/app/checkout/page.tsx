import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout-form";
import { SignedIn } from "@/components/signed-in";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <SignedIn prompt="Sign in to check out.">
      <CheckoutForm />
    </SignedIn>
  );
}
