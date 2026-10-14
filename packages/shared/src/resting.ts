import type { BrewMethod, RoastLevel } from "./enums";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rest window (days post-roast) during which a coffee typically tastes best.
 * Espresso and lighter roasts need longer to degas.
 */
export function restWindowDays(opts: { roastLevel?: RoastLevel | null; brewMethod?: BrewMethod | null }): {
  from: number;
  to: number;
} {
  const espresso = opts.brewMethod === "espresso" || opts.roastLevel === "espresso";
  const light = opts.roastLevel === "light" || opts.roastLevel === "omni";
  if (espresso) return light ? { from: 14, to: 35 } : { from: 10, to: 28 };
  return light ? { from: 7, to: 30 } : { from: 5, to: 21 };
}

export type RestState = "resting" | "peak" | "past_peak";

export function restState(
  roastDate: Date,
  window: { from: number; to: number },
  now: Date = new Date(),
): { state: RestState; daysSinceRoast: number; peakFrom: Date; peakTo: Date } {
  const daysSinceRoast = Math.floor((now.getTime() - roastDate.getTime()) / DAY_MS);
  const peakFrom = new Date(roastDate.getTime() + window.from * DAY_MS);
  const peakTo = new Date(roastDate.getTime() + window.to * DAY_MS);
  const state: RestState =
    daysSinceRoast < window.from ? "resting" : daysSinceRoast <= window.to ? "peak" : "past_peak";
  return { state, daysSinceRoast, peakFrom, peakTo };
}
