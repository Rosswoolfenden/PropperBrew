import type { Metadata } from "next";
import Link from "next/link";
import { formatPriceFrom, humanize, notesSentence, SEARCH_MAX_PRICES, SEARCH_SORT_LABELS, SEARCH_SORTS } from "@propperbrew/shared";
import { Rating } from "@/components/rating";
import { readSearchParams, searchHref, toSearchInput, type SearchParams } from "@/lib/search-params";
import { api } from "@/lib/trpc";

export const metadata: Metadata = {
  title: "Search",
  description: "Search specialty coffee from independent UK roasters by origin, process, roast, price and tasting notes.",
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = readSearchParams(await searchParams);
  const { input, page } = toSearchInput(params);
  const [results, options] = await Promise.all([api.beans.search.query(input), api.beans.searchOptions.query()]);
  const filtered = Object.entries(params).some(([k, v]) => v && k !== "page" && k !== "sort");

  /** A row of filter chips; picking the active one again clears it. */
  const chips = (label: string, key: keyof SearchParams, choices: { value: string; label: string }[]) => (
    <div className="filter-group" role="group" aria-label={label}>
      <span className="eyebrow">{label}</span>
      <div className="chips">
        {choices.map((c) => {
          const active = params[key] === c.value;
          return (
            <Link key={c.value} href={searchHref(params, { [key]: active ? undefined : c.value })} className={`filter-chip${active ? " on" : ""}`} aria-current={active ? "true" : undefined}>
              {c.label}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <section className="intro">
        <p className="eyebrow">Search</p>
        <h1 className="display">Find your next coffee</h1>
      </section>

      <form action="/search" role="search" className="search-bar">
        <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Coffee, origin, roaster or tasting note" aria-label="Search coffees" />
        {/* Keep the current filters when searching new words. */}
        {Object.entries(params).map(([k, v]) => (k === "q" || k === "page" || !v ? null : <input key={k} type="hidden" name={k} value={v} />))}
        <button type="submit" className="button button-sm">
          Search
        </button>
      </form>

      <div className="filters">
        {chips("Sort", "sort", SEARCH_SORTS.filter((s) => s !== "newest").map((s) => ({ value: s, label: SEARCH_SORT_LABELS[s] })))}
        {chips("Origin", "origin", options.origins.map((o) => ({ value: o, label: o })))}
        {chips("Process", "process", options.processes.map((p) => ({ value: p, label: humanize(p) })))}
        {chips("Roast", "roast", options.roastLevels.map((r) => ({ value: r, label: humanize(r) })))}
        {chips("Price", "max", SEARCH_MAX_PRICES.map((p) => ({ value: String(p / 100), label: `Under £${p / 100}` })))}
        {(options.hasDecaf || params.decaf) && chips("More", "decaf", [{ value: "1", label: "Decaf" }])}
        {chips("Availability", "all", [{ value: "1", label: "Include sold out" }])}
      </div>

      <div className="results-head">
        <p className="muted" role="status">
          {results.total} {results.total === 1 ? "coffee" : "coffees"}
          {params.q ? ` for “${params.q}”` : ""}
        </p>
        {filtered && (
          <Link href="/search" className="rule-link">
            Clear search
          </Link>
        )}
      </div>

      {results.items.length === 0 ? (
        <p className="note">No coffees match. Try fewer filters or different words.</p>
      ) : (
        <ul className="roast-grid search-results" aria-label="Results">
          {results.items.map((c) => (
            <li key={c.id}>
              <Link href={`/${c.roaster.slug}/${c.slug}`} className="roast-card">
                <div className="frame frame-contain">{c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" />}</div>
                {c.roastLevel && <span className="chip chip-sm">{humanize(c.roastLevel)} roast</span>}
                <h3>{c.name}</h3>
                <p className="subtitle">
                  {c.roaster.name}
                  {c.originCountry ? ` · ${c.originCountry}` : ""}
                </p>
                {c.tastingNotes.length > 0 && <p className="muted">{notesSentence(c.tastingNotes)}</p>}
                {c.avgRating !== null && <Rating value={c.avgRating} count={c.reviewCount} />}
                <span className="roast-price">{c.fromPricePence !== null ? formatPriceFrom(c.fromPricePence, c.priceCount) : "Sold out"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || results.hasMore) && (
        <nav className="pager" aria-label="Pages">
          {page > 1 ? (
            <Link href={searchHref(params, { page: page > 2 ? String(page - 1) : undefined })} className="rule-link">
              Previous
            </Link>
          ) : (
            <span />
          )}
          {results.hasMore && (
            <Link href={searchHref(params, { page: String(page + 1) })} className="rule-link">
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
