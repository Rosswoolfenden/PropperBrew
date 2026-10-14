import { eq } from "drizzle-orm";
import { roasters } from "@propperbrew/db";
import { env } from "../env";
import { db } from "../lib/db";
import { decrypt } from "../lib/crypto";

export class ShopifyAdminError extends Error {}

export async function adminGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": accessToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new ShopifyAdminError(`Shopify ${shop} ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors || !json.data) throw new ShopifyAdminError(`Shopify ${shop} GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

/** Admin client for an installed roaster. */
export async function adminForRoaster(roasterId: string) {
  const roaster = await db.query.roasters.findFirst({ where: eq(roasters.id, roasterId) });
  if (!roaster?.shopifyDomain || !roaster.shopifyAccessTokenEnc) {
    throw new ShopifyAdminError(`Roaster ${roasterId} has no active Shopify install`);
  }
  const shop = roaster.shopifyDomain;
  const token = decrypt(roaster.shopifyAccessTokenEnc);
  return <T>(query: string, variables?: Record<string, unknown>) => adminGraphql<T>(shop, token, query, variables);
}
