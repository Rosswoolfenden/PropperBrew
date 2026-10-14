import { palette, type Palette } from "@propperbrew/shared";

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const vars = (p: Palette) =>
  Object.entries(p)
    .map(([k, v]) => `--${kebab(k)}:${v};`)
    .join("");

/** The shared palette as CSS custom properties (`surfaceContainerLow` → `--surface-container-low`). */
export const themeCss =
  `:root{${vars(palette.light)}color-scheme:light}` +
  `@media (prefers-color-scheme:dark){:root{${vars(palette.dark)}color-scheme:dark}}`;
