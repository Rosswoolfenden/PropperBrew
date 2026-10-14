/**
 * Design tokens from the Stitch "Elevated Brew" design system (project 6688609155923497822).
 * Web turns these into CSS custom properties; mobile reads them directly.
 *
 * Sections are separated by surface tiers rather than borders. `outlineVariant` is only
 * ever used as a "ghost border" at low opacity.
 */
export const palette = {
  light: {
    primary: "#334537",
    primaryContainer: "#4a5d4e",
    surfaceTint: "#506354",
    onPrimary: "#ffffff",
    secondary: "#77574b",
    secondaryContainer: "#ffd4c4",
    onSecondaryContainer: "#7a594d",
    surface: "#fcf9f4",
    surfaceContainerLowest: "#ffffff",
    surfaceContainerLow: "#f6f3ee",
    surfaceContainer: "#f0ede8",
    surfaceContainerHigh: "#ebe8e3",
    surfaceContainerHighest: "#e5e2dd",
    onSurface: "#1c1c19",
    onSurfaceVariant: "#434843",
    outline: "#737872",
    outlineVariant: "#c3c8c1",
    error: "#ba1a1a",
  },
  dark: {
    primary: "#ebe8e3",
    primaryContainer: "#394b3d",
    surfaceTint: "#b7ccb9",
    onPrimary: "#1c1c19",
    secondary: "#e7beae",
    secondaryContainer: "#5d4034",
    onSecondaryContainer: "#ffdbce",
    surface: "#1c1c19",
    surfaceContainerLowest: "#12120f",
    surfaceContainerLow: "#252522",
    surfaceContainer: "#2a2a27",
    surfaceContainerHigh: "#31302d",
    surfaceContainerHighest: "#3c3c38",
    onSurface: "#ebe8e3",
    onSurfaceVariant: "#c3c8c1",
    outline: "#8d928d",
    outlineVariant: "#434843",
    error: "#ffb4ab",
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Palette = { [K in keyof (typeof palette)["light"]]: string };

/** Corner radii in px. The design avoids pill shapes except on avatars. */
export const radius = { sm: 2, md: 6, lg: 8, xl: 12 } as const;
