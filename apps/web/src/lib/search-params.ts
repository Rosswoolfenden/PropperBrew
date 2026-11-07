import { BeanSearchInput, PROCESSES, ROAST_LEVELS, SEARCH_SORTS, type SearchSort } from "@propperbrew/shared";

/** The search page's URL parameters: short, shareable, and all optional. */
export type SearchParams = {
  q?: string;
  origin?: string;
  process?: string;
  roast?: string;
  /** Whole pounds, e.g. "10" for under £10. */
  max?: string;
  sort?: string;
  decaf?: string;
  /** "1" to include coffees that are sold out. */
  all?: string;
  page?: string;
};

export const PAGE_SIZE = 24;
const KEYS = ["q", "origin", "process", "roast", "max", "sort", "decaf", "all", "page"] as const satisfies (keyof SearchParams)[];

/** Next's raw search params → just ours, one string each (a repeated `?q=a&q=b` keeps the first). */
export function readSearchParams(raw: Record<string, string | string[] | undefined>): SearchParams {
  const out: SearchParams = {};
  for (const k of KEYS) {
    const v = raw[k];
    const first = Array.isArray(v) ? v[0] : v;
    if (first) out[k] = first;
  }
  return out;
}

/** URL parameters → API search input. Anything unrecognised is ignored rather than an error. */
export function toSearchInput(p: SearchParams) {
  const page = Math.max(1, Math.min(100, Number.parseInt(p.page ?? "1", 10) || 1));
  const max = Number.parseInt(p.max ?? "", 10);
  const input = BeanSearchInput.safeParse({
    query: p.q?.trim() || undefined,
    originCountry: p.origin || undefined,
    process: (PROCESSES as readonly string[]).includes(p.process ?? "") ? p.process : undefined,
    roastLevel: (ROAST_LEVELS as readonly string[]).includes(p.roast ?? "") ? p.roast : undefined,
    decaf: p.decaf === "1" ? true : undefined,
    inStockOnly: p.all !== "1",
    maxPricePence: max > 0 && max <= 1000 ? max * 100 : undefined,
    sort: (SEARCH_SORTS as readonly string[]).includes(p.sort ?? "") ? (p.sort as SearchSort) : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  return { input: input.success ? input.data : BeanSearchInput.parse({ limit: PAGE_SIZE }), page };
}

/**
 * The search URL with some parameters changed (undefined removes one). Changing filters goes back
 * to page 1. Parameters always come in the same order, so the same search is always the same link.
 */
export function searchHref(current: SearchParams, changes: Partial<SearchParams>): string {
  const next: SearchParams = { ...current, page: undefined, ...changes };
  const params = new URLSearchParams();
  for (const k of KEYS) if (next[k]) params.set(k, next[k]);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}
