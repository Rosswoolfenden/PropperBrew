import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedBeanSpecs, ScannedBag } from "@propperbrew/shared";
import { env } from "../env";

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

export class ExtractionRefusedError extends Error {}

const htmlToText = (html: string) =>
  html
    .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

const EXTRACT_SYSTEM = `You extract structured specialty-coffee data from UK roasters' Shopify product listings.
Only report what the listing states or makes unambiguous. Use null (or an empty array) when a field isn't present; never guess.
Normalise country names to English short names (e.g. "Ethiopia", "Colombia"). Map processes onto the allowed enum values;
use "experimental" for co-ferments, infused, yeast or other novel processes. "omni" means a roast marketed for both filter and espresso.`;

/** Turns a messy Shopify product description into canonical bean specs. */
export async function extractBeanSpecs(input: {
  roasterName: string;
  title: string;
  bodyHtml: string;
  variantTitles: string[];
}): Promise<ExtractedBeanSpecs> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(ExtractedBeanSpecs) },
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `Roaster: ${input.roasterName}`,
          `Product title: ${input.title}`,
          `Variants: ${input.variantTitles.join(" | ")}`,
          `Description:\n${htmlToText(input.bodyHtml)}`,
        ].join("\n\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new ExtractionRefusedError(`Extraction failed for "${input.title}" (stop_reason=${response.stop_reason})`);
  }
  return response.parsed_output;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

/** The "Vivino moment": read roaster + bean name off a photo of the bag. */
export async function readBagPhoto(imageBase64: string, mediaType: ImageMediaType): Promise<ScannedBag> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(ScannedBag) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text: "This is a photo of a specialty coffee bag. Read the roaster's name and the coffee's name exactly as printed. Return null for anything not legible.",
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new ExtractionRefusedError(`Bag scan failed (stop_reason=${response.stop_reason})`);
  }
  return response.parsed_output;
}
