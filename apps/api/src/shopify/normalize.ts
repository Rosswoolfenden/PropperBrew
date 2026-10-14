import type { GrindOption } from "@propperbrew/shared";

/** Common shape for products from webhooks (REST JSON) and GraphQL backfills. */
export type NormalizedVariant = {
  shopifyVariantId: string;
  inventoryItemId: string | null;
  title: string;
  options: string[];
  pricePence: number;
  inStock: boolean;
  alwaysAvailable: boolean;
};

export type NormalizedProduct = {
  shopifyProductId: string;
  title: string;
  handle: string | null;
  status: string | null;
  bodyHtml: string;
  imageUrl: string | null;
  variants: NormalizedVariant[];
};

const toPence = (price: string | number) => Math.round(Number(price) * 100);

// --- REST-shaped webhook payload (products/create, products/update) ---

type RestVariant = {
  id: number;
  title: string;
  price: string;
  inventory_item_id?: number | null;
  inventory_quantity?: number | null;
  inventory_management?: string | null;
  inventory_policy?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
};

export type RestProduct = {
  id: number;
  title: string;
  handle?: string;
  status?: string;
  body_html?: string | null;
  image?: { src: string } | null;
  images?: { src: string }[];
  variants?: RestVariant[];
};

export function fromRestProduct(p: RestProduct): NormalizedProduct {
  return {
    shopifyProductId: String(p.id),
    title: p.title,
    handle: p.handle ?? null,
    status: p.status ?? null,
    bodyHtml: p.body_html ?? "",
    imageUrl: p.image?.src ?? p.images?.[0]?.src ?? null,
    variants: (p.variants ?? []).map((v) => {
      // Most indie roasters roast-to-order and don't track inventory at all.
      const alwaysAvailable = !v.inventory_management || v.inventory_policy === "continue";
      return {
        shopifyVariantId: String(v.id),
        inventoryItemId: v.inventory_item_id ? String(v.inventory_item_id) : null,
        title: v.title,
        options: [v.option1, v.option2, v.option3].filter((o): o is string => !!o),
        pricePence: toPence(v.price),
        alwaysAvailable,
        inStock: alwaysAvailable || (v.inventory_quantity ?? 0) > 0,
      };
    }),
  };
}

// --- GraphQL backfill shape ---

export const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($cursor: String) {
    products(first: 50, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        legacyResourceId
        title
        handle
        status
        descriptionHtml
        featuredImage { url }
        variants(first: 100) {
          nodes {
            legacyResourceId
            title
            price
            inventoryQuantity
            inventoryPolicy
            selectedOptions { value }
            inventoryItem { legacyResourceId tracked }
          }
        }
      }
    }
  }
`;

export type GqlProductsPage = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      legacyResourceId: string;
      title: string;
      handle: string;
      status: string;
      descriptionHtml: string;
      featuredImage: { url: string } | null;
      variants: {
        nodes: {
          legacyResourceId: string;
          title: string;
          price: string;
          inventoryQuantity: number | null;
          inventoryPolicy: "CONTINUE" | "DENY";
          selectedOptions: { value: string }[];
          inventoryItem: { legacyResourceId: string; tracked: boolean } | null;
        }[];
      };
    }[];
  };
};

export function fromGqlProduct(p: GqlProductsPage["products"]["nodes"][number]): NormalizedProduct {
  return {
    shopifyProductId: p.legacyResourceId,
    title: p.title,
    handle: p.handle,
    status: p.status.toLowerCase(),
    bodyHtml: p.descriptionHtml,
    imageUrl: p.featuredImage?.url ?? null,
    variants: p.variants.nodes.map((v) => {
      const alwaysAvailable = !v.inventoryItem?.tracked || v.inventoryPolicy === "CONTINUE";
      return {
        shopifyVariantId: v.legacyResourceId,
        inventoryItemId: v.inventoryItem?.legacyResourceId ?? null,
        title: v.title,
        options: v.selectedOptions.map((o) => o.value),
        pricePence: toPence(v.price),
        alwaysAvailable,
        inStock: alwaysAvailable || (v.inventoryQuantity ?? 0) > 0,
      };
    }),
  };
}

// --- Variant option parsing ("250g / Wholebean", "1kg - Espresso") ---

export function parseWeightG(texts: string[]): number | null {
  for (const t of texts) {
    const kg = t.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
    if (kg) return Math.round(Number(kg[1]) * 1000);
    const g = t.match(/(\d+)\s*(?:g|grams?)\b/i);
    if (g) return Number(g[1]);
  }
  return null;
}

const GRIND_PATTERNS: [RegExp, GrindOption][] = [
  [/whole\s*-?\s*bean|beans?\b(?!.*ground)/i, "wholebean"],
  [/espresso/i, "espresso"],
  [/v60|pour\s*over/i, "v60"],
  [/aero\s*press/i, "aeropress"],
  [/caf[eé]ti[eè]re|french\s*press|plunger/i, "cafetiere"],
  [/moka|stove\s*top/i, "moka_pot"],
  [/filter|chemex|drip/i, "filter"],
];

export function parseGrind(texts: string[]): GrindOption {
  for (const t of texts) {
    for (const [re, grind] of GRIND_PATTERNS) if (re.test(t)) return grind;
  }
  return "unknown";
}
