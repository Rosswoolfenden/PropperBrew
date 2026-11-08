import { useQuery } from "@tanstack/react-query";
import { radius } from "@propperbrew/shared";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { fonts, themed } from "./theme";
import { useSession } from "./session";
import { useTRPC } from "./trpc";
import { HeaderIcon } from "./ui";

/** Top-bar basket, with how many bags are in it. Only shown where in-app checkout is on. */
export function BasketIcon() {
  const styles = useStyles();
  const trpc = useTRPC();
  const { session } = useSession();
  const enabled = useQuery(trpc.basket.enabled.queryOptions());
  const basket = useQuery({ ...trpc.basket.get.queryOptions(), enabled: !!session && enabled.data === true });
  if (!enabled.data) return null;
  const count = basket.data?.count ?? 0;
  return (
    <View>
      <HeaderIcon icon="shopping-bag" label={`Basket, ${count} ${count === 1 ? "item" : "items"}`} onPress={() => router.push("/basket")} />
      {count > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    badge: {
      position: "absolute",
      top: 2,
      right: 0,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: radius.xl,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.secondaryContainer,
    },
    badgeText: { fontFamily: fonts.labelBold, fontSize: 10, color: c.onSecondaryContainer },
  }),
);
