import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text } from "react-native";
import { fontAssets, fonts, useColors } from "@/theme";
import { ApiProvider } from "@/trpc";
import { HeaderIcon } from "@/ui";

const BRAND = "PropperBrew";

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
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: fonts.title, color: colors.primary },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: BRAND, headerTitleStyle: { fontFamily: fonts.headline, fontSize: 20, color: colors.primary } }}
        />
        <Stack.Screen name="scan" options={{ title: "Scan a bag", presentation: "modal" }} />
        <Stack.Screen name="shelf" options={{ title: "My shelf" }} />
        <Stack.Screen
          name="sign-in"
          options={{
            title: "Sign in",
            presentation: "modal",
            headerLeft: () => <HeaderIcon icon="close" label="Close" onPress={() => router.back()} />,
            headerTitle: () => (
              <Text style={{ fontFamily: fonts.title, fontSize: 18, letterSpacing: 4, color: colors.primary }}>
                {BRAND.toUpperCase()}
              </Text>
            ),
          }}
        />
        <Stack.Screen name="bean/[roaster]/[bean]" options={{ title: BRAND }} />
        <Stack.Screen name="recipe/[id]" options={{ title: BRAND }} />
        <Stack.Screen
          name="recipe/new"
          options={{
            title: BRAND,
            presentation: "modal",
            headerLeft: () => <HeaderIcon icon="close" label="Close" onPress={() => router.back()} />,
          }}
        />
      </Stack>
    </ApiProvider>
  );
}
