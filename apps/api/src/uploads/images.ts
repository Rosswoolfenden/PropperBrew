import sharp from "sharp";
import type { UploadKind } from "@propperbrew/shared";

/** How each kind of photo is stored: square crops for faces and logos, a capped width for review photos. */
const SIZES: Record<UploadKind, { width: number; height?: number; fit: "cover" | "inside" }> = {
  avatar: { width: 512, height: 512, fit: "cover" },
  logo: { width: 512, height: 512, fit: "inside" },
  review: { width: 1600, height: 1600, fit: "inside" },
};

export class NotAnImage extends Error {}

/**
 * Re-encode an uploaded photo as WebP at its kind's size. Turned the right way up first, and
 * nothing else survives: no EXIF, so no location from a phone camera.
 */
export async function processImage(bytes: Buffer, kind: UploadKind) {
  let meta;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    throw new NotAnImage("That isn't a photo we can read. Use a JPEG, PNG, WebP or HEIC image.");
  }
  if (!meta.format || !["jpeg", "png", "webp", "heif", "gif", "avif"].includes(meta.format)) {
    throw new NotAnImage("That isn't a photo we can read. Use a JPEG, PNG, WebP or HEIC image.");
  }
  const size = SIZES[kind];
  const out = await sharp(bytes, { animated: false })
    .rotate()
    .resize({ width: size.width, height: size.height, fit: size.fit, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: out.data, width: out.info.width, height: out.info.height, contentType: "image/webp" };
}
