/** Ratings are stored as integers (10–50) to avoid float drift; expose as 1.0–5.0. */
export const ratingToDb = (rating: number) => Math.round(rating * 10);
export const ratingFromDb = (stored: number) => stored / 10;

export const formatGbp = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);

export const brewRatio = (doseG: number, waterG: number) => `1:${(waterG / doseG).toFixed(1)}`;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** `medium_dark` → `Medium dark`. For showing enum values (process, roast level, brew method). */
export const humanize = (value: string) => value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** "£12.50", or "from £12.50" when the sizes/grinds on offer have different prices. */
export const formatPriceFrom = (lowestPence: number, distinctPrices: number) =>
  `${distinctPrices > 1 ? "from " : ""}${formatGbp(lowestPence)}`;

/** "Hackney Heights'" / "Ozone's": the possessive of a name, for copy like "Checkout on X shop". */
export const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/** 1850 → "1,850 MASL". */
export const formatAltitude = (metres: number) => `${metres.toLocaleString("en-GB")} MASL`;

/** ["Jasmine", "Bergamot", "Peach"] → "Notes of jasmine, bergamot & peach". */
export function notesSentence(notes: readonly string[]): string {
  const lower = notes.map((n) => n.toLowerCase());
  const list = lower.length > 1 ? `${lower.slice(0, -1).join(", ")} & ${lower.at(-1)}` : (lower[0] ?? "");
  return `Notes of ${list}`;
}

/** 165 → "2:45". */
export const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** "2:45" → 165, "45" → 45. Null for anything else. */
export function parseDuration(text: string): number | null {
  const m = /^\s*(?:(\d{1,3}):)?(\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  const [, minutes, seconds] = m;
  if (minutes !== undefined && Number(seconds) > 59) return null;
  return Number(minutes ?? 0) * 60 + Number(seconds);
}
