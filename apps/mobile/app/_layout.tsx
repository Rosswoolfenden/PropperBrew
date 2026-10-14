import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { fontAssets, fonts, useColors } from "@/theme";
import { ApiProvider } from "@/trpc";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colors = useColors();
  // Fall back to system fonts rather than hang on the splash screen if loading fails.
  const [loaded, error] = useFonts(fontAssets);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ApiProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: fonts.title, color: colors.primary },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: "PropperBrew", headerTitleStyle: { fontFamily: fonts.headline, fontSize: 20, color: colors.primary } }}
        />
        <Stack.Screen name="scan" options={{ title: "Scan a bag", presentation: "modal" }} />
        <Stack.Screen name="shelf" options={{ title: "My shelf" }} />
        <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
        <Stack.Screen name="bean/[roaster]/[bean]" options={{ title: "" }} />
      </Stack>
    </ApiProvider>
  );
}
