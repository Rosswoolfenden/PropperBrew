import { z } from "zod";

export const PROCESSES = [
  "washed",
  "natural",
  "honey",
  "anaerobic",
  "carbonic_maceration",
  "wet_hulled",
  "experimental",
] as const;
export const Process = z.enum(PROCESSES);
export type Process = z.infer<typeof Process>;

export const ROAST_LEVELS = ["light", "medium", "medium_dark", "dark", "omni", "espresso"] as const;
export const RoastLevel = z.enum(ROAST_LEVELS);
export type RoastLevel = z.infer<typeof RoastLevel>;

export const BREW_METHODS = [
  "v60",
  "origami",
  "kalita_wave",
  "chemex",
  "aeropress",
  "espresso",
  "french_press",
  "moka_pot",
  "cold_brew",
  "clever_dripper",
] as const;
export const BrewMethod = z.enum(BREW_METHODS);
export type BrewMethod = z.infer<typeof BrewMethod>;

/** How each brew method is named on screen. */
export const BREW_METHOD_LABELS: Record<BrewMethod, string> = {
  v60: "V60 Pour-Over",
  origami: "Origami Dripper",
  kalita_wave: "Kalita Wave",
  chemex: "Chemex",
  aeropress: "AeroPress",
  espresso: "Espresso",
  french_press: "French Press",
  moka_pot: "Moka Pot",
  cold_brew: "Cold Brew",
  clever_dripper: "Clever Dripper",
};

export const GRIND_OPTIONS = [
  "wholebean",
  "espresso",
  "filter",
  "v60",
  "aeropress",
  "cafetiere",
  "moka_pot",
  "unknown",
] as const;
export const GrindOption = z.enum(GRIND_OPTIONS);
export type GrindOption = z.infer<typeof GrindOption>;

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "pushed_to_shopify",
  "fulfilled",
  "partially_fulfilled",
  "refunded",
  "failed",
] as const;
export const OrderStatus = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatus>;
