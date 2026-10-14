import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { Newsreader_400Regular } from "@expo-google-fonts/newsreader/400Regular";
import { Newsreader_400Regular_Italic } from "@expo-google-fonts/newsreader/400Regular_Italic";
import { palette, type Palette } from "@propperbrew/shared";
import { useMemo } from "react";
import { useColorScheme } from "react-native";

/** Pass to `useFonts` in the root layout. Keys are the family names used in styles. */
export const fontAssets = {
  Manrope_500Medium,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
};

/** Manrope for headlines and labels, Newsreader for body copy. */
export const fonts = {
  headline: "Manrope_800ExtraBold",
  title: "Manrope_700Bold",
  label: "Manrope_500Medium",
  labelBold: "Manrope_700Bold",
  body: "Newsreader_400Regular",
  bodyItalic: "Newsreader_400Regular_Italic",
} as const satisfies Record<string, keyof typeof fontAssets>;

export function useColors(): Palette {
  return palette[useColorScheme() === "dark" ? "dark" : "light"];
}

/** `const useStyles = themed((c) => StyleSheet.create({...}))` — recomputed only when the scheme flips. */
export function themed<T>(factory: (colors: Palette) => T) {
  return function useThemedStyles(): T {
    const colors = useColors();
    return useMemo(() => factory(colors), [colors]);
  };
}
