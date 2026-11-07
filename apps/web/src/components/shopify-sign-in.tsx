"use client";

import { useState, type FormEvent } from "react";
import { normalizeShopDomain } from "@propperbrew/shared";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** "Continue with Shopify": Shopify confirms you run the store, then signs you in here. */
export function ShopifySignIn() {
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const domain = normalizeShopDomain(shop);
    if (!domain) return setError("Enter your store's address, e.g. your-store.myshopify.com");
    window.location.assign(`${apiUrl}/api/shopify/login?shop=${encodeURIComponent(domain)}`);
  };

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label className="field">
        <span className="eyebrow">Shopify store</span>
        <input placeholder="your-store.myshopify.com" autoCapitalize="none" spellCheck={false} value={shop} onChange={(e) => (setShop(e.target.value), setError(null))} />
      </label>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button button-shopify">
        Continue with Shopify
      </button>
    </form>
  );
}
