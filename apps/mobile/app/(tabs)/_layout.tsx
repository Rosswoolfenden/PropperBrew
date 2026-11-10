import { MaterialIcons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useBasketSummary } from "@/basket";
import { fonts, useColors } from "@/theme";
import { HeaderIcon } from "@/ui";

type IconName = ComponentProps<typeof MaterialIcons>["name"];
const icon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <MaterialIcons name={name} size={24} color={color} />;
  };
const scan = () => <HeaderIcon icon="photo-camera" label="Scan a bag" onPress={() => router.push("/scan")} />;

/** The bottom tabs from the Stitch designs: Explore, Journal, Basket (when checkout is on), Profile. */
export default function TabsLayout() {
  const colors = useColors();
  const basket = useBasketSummary();
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontFamily: fonts.title, color: colors.primary },
        sceneStyle: { backgroundColor: colors.surface },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.outline,
        tabBarStyle: { backgroundColor: colors.surface, borderTopWidth: 0, elevation: 0, shadowOpacity: 0 },
        tabBarLabelStyle: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
        tabBarBadgeStyle: { backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer, fontFamily: fonts.labelBold, fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Explore",
          headerTitle: "PropperBrew",
          headerTitleStyle: { fontFamily: fonts.headline, fontSize: 20, color: colors.primary },
          headerLeft: scan,
          tabBarIcon: icon("explore"),
          // Named explicitly: otherwise the icon font's glyph ends up in the name.
          tabBarAccessibilityLabel: "Explore",
        }}
      />
      <Tabs.Screen name="journal" options={{ title: "Journal", headerRight: scan, tabBarIcon: icon("menu-book"), tabBarAccessibilityLabel: "Journal" }} />
      <Tabs.Screen
        name="basket"
        options={{
          title: "Basket",
          tabBarIcon: icon("shopping-bag"),
          tabBarBadge: basket.count > 0 ? basket.count : undefined,
          tabBarAccessibilityLabel: `Basket, ${basket.count} ${basket.count === 1 ? "item" : "items"}`,
          // Only where coffees can be bought here.
          href: basket.enabled ? undefined : null,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person"), tabBarAccessibilityLabel: "Profile" }} />
    </Tabs>
  );
}
