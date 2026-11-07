import type { SensoryDimension } from "./schemas";

/** How each sensory dimension is labelled, and what a score of 1–5 reads as. */
export const SENSORY: Record<SensoryDimension, { label: string; low: string; high: string; levels: [string, string, string, string, string] }> = {
  acidity: { label: "Acidity", low: "Low", high: "High", levels: ["Soft", "Gentle", "Balanced", "Bright", "Bright & citric"] },
  sweetness: { label: "Sweetness", low: "Low", high: "High", levels: ["Dry", "Subtle", "Rounded", "Sweet", "Honeyed"] },
  body: { label: "Body", low: "Light", high: "Full", levels: ["Tea-like", "Light", "Medium", "Round", "Syrupy"] },
  aftertaste: { label: "Aftertaste", low: "Short", high: "Lingering", levels: ["Fleeting", "Short", "Clean finish", "Long", "Lingering"] },
  balance: { label: "Balance", low: "Low", high: "High", levels: ["Uneven", "Edgy", "Balanced", "Harmonic", "Very harmonic"] },
};

/** "Bright & citric" for an average like 4.6 (rounded to the nearest level). */
export const sensoryLevel = (dimension: SensoryDimension, score: number) =>
  SENSORY[dimension].levels[Math.min(4, Math.max(0, Math.round(score) - 1))]!;
