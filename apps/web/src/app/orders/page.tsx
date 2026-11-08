import type { Metadata } from "next";
import { OrdersList } from "@/components/orders-list";
import { SignedIn } from "@/components/signed-in";

export const metadata: Metadata = { title: "Your orders" };

export default function OrdersPage() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">Orders</p>
        <h1 className="display">Your orders</h1>
      </section>
      <SignedIn prompt="Sign in to see your orders.">
        <OrdersList />
      </SignedIn>
    </>
  );
}
