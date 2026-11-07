import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { ShopifySignIn } from "@/components/shopify-sign-in";

export const metadata: Metadata = {
  title: "For roasters",
  description: "Put your coffees in front of the people who brew them: reviews, community recipes and orders straight to your Shopify store.",
};

/** Errors the Shopify sign-in sends back here (see apps/api/src/routes/shopify.ts). */
const ERRORS: Record<string, (shop?: string) => string> = {
  "not-connected": (shop) =>
    `${shop ?? "That store"} isn't on PropperBrew yet. Create a business account below, then connect your store from your dashboard.`,
  "email-unverified": () => "Shopify hasn't verified the email on your staff account. Verify it in Shopify, or sign in with email instead.",
  "invalid-shop": () => "That doesn't look like a Shopify store address.",
};

export default async function BusinessPage({ searchParams }: { searchParams: Promise<{ error?: string; shop?: string }> }) {
  const { error, shop } = await searchParams;
  const problem = error ? (ERRORS[error]?.(shop) ?? "Something went wrong signing in. Please try again.") : null;

  return (
    <>
      <section className="intro">
        <p className="eyebrow">PropperBrew for roasters</p>
        <h1 className="display">Your coffee, in front of the people who brew it</h1>
        <p className="lead">
          Connect your Shopify store and your coffees appear on PropperBrew with reviews, community recipes and orders that land in your
          usual Shopify admin.
        </p>
      </section>
      {problem && (
        <p className="alert alert-error business-alert" role="alert">
          {problem}
        </p>
      )}
      <div className="business-auth">
        <section className="card" aria-labelledby="business-email">
          <h2 id="business-email">Sign in with email</h2>
          <AuthForm accountType="business" redirectTo="/business/dashboard" />
        </section>
        <section className="card" aria-labelledby="business-shopify">
          <h2 id="business-shopify">Already on Shopify?</h2>
          <p className="muted">Sign in as a staff member of a store that&apos;s connected to PropperBrew.</p>
          <ShopifySignIn />
        </section>
      </div>
    </>
  );
}
