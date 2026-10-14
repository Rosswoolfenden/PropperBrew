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
