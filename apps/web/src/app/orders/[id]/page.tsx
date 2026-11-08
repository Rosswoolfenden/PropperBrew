import type { Metadata } from "next";
import { OrderConfirmation } from "@/components/order-confirmation";
import { SignedIn } from "@/components/signed-in";

export const metadata: Metadata = { title: "Your order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <SignedIn prompt="Sign in to see your order.">
      <OrderConfirmation checkoutId={id} />
    </SignedIn>
  );
}
