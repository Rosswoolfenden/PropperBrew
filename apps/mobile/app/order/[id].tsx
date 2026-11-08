import { MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { formatGbp, radius } from "@propperbrew/shared";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Eyebrow, GUTTER, Loading } from "@/ui";

const arrival = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const ORDER_STATUS: Record<string, string> = {
  paid: "Paid, on its way to the roaster",
  pushed_to_shopify: "With the roaster",
  fulfilled: "Posted",
  partially_fulfilled: "Partly posted",
  refunded: "Refunded",
};

/** Stitch Order Confirmation. Checks every couple of seconds until Stripe confirms the payment. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const styles = useStyles();
  const colors = useColors();
  const order = useQuery({
    ...trpc.orders.get.queryOptions({ checkoutId: id }),
    retry: (n, err) => err.data?.code !== "NOT_FOUND" && err.data?.code !== "BAD_REQUEST" && n < 2,
    refetchInterval: (q) => (q.state.data?.status === "open" ? 2000 : false),
  });

  if (order.isPending) return <Loading />;
  if (order.error) {
    return (
      <Body muted style={{ padding: GUTTER }}>
        {order.error.data?.code === "NOT_FOUND" || order.error.data?.code === "BAD_REQUEST" ? "We can't find that order." : "We couldn't load your order."}
      </Body>
    );
  }
  const o = order.data;
  const head =
    o.status === "paid"
      ? { icon: "check" as const, title: "Your brew is on its way.", body: "Thank you. Your order has gone to the roaster, who'll post it to you." }
      : o.status === "open"
        ? { icon: "hourglass-empty" as const, title: "Waiting for your payment", body: "If you closed the payment page, your basket is just as you left it." }
        : { icon: "close" as const, title: "This order wasn't paid.", body: "Nothing was charged. Your coffees are still in your basket." };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.head}>
        <View style={[styles.badge, o.status === "paid" && styles.badgePaid]}>
          <MaterialIcons name={head.icon} size={28} color={colors.primary} />
        </View>
        <Text role="heading" style={styles.title}>
          {head.title}
        </Text>
        <Body italic muted style={styles.center}>
          {head.body}
        </Body>
      </View>

      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Eyebrow>Order reference</Eyebrow>
          <Text style={styles.big}>{o.reference}</Text>
        </View>
        {o.arrivesBy && (
          <View style={[styles.cardRow, styles.cardRowLow]}>
            <Eyebrow>Arrives by</Eyebrow>
            <Text style={styles.big}>{arrival.format(o.arrivesBy)}</Text>
          </View>
        )}
      </View>

      <View role="region" aria-label="What you ordered" style={styles.manifest}>
        <Eyebrow>What you ordered</Eyebrow>
        {o.orders.map((r) => (
          <View key={r.id} style={{ gap: 8 }}>
            <View style={styles.row}>
              <Text style={styles.roaster}>{r.roaster.name}</Text>
              {o.status === "paid" && ORDER_STATUS[r.status] && (
                <Body italic muted style={{ fontSize: 14 }}>
                  {ORDER_STATUS[r.status]}
                </Body>
              )}
            </View>
            {r.lines.map((l) => (
              <View key={l.title} style={styles.row}>
                <Body style={{ flex: 1 }}>{l.title}</Body>
                <Body>{l.quantity}</Body>
              </View>
            ))}
            <View style={styles.row}>
              <Body muted>Delivery</Body>
              <Body muted>{r.shippingPence === 0 ? "Free" : formatGbp(r.shippingPence)}</Body>
            </View>
          </View>
        ))}
        <View style={[styles.row, { marginTop: 8 }]}>
          <Eyebrow>Total</Eyebrow>
          <Text style={styles.big}>{formatGbp(o.totalPence)}</Text>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <Button label="Back to explore" onPress={() => router.dismissTo("/")} />
        {o.status === "paid" ? (
          <Button label="All your orders" variant="text" onPress={() => router.push("/orders")} />
        ) : (
          <Button label="Back to basket" variant="secondary" onPress={() => router.push("/basket")} />
        )}
      </View>
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 32 },
    head: { alignItems: "center", gap: 14, paddingTop: 16 },
    badge: { width: 64, height: 64, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceContainerHigh },
    badgePaid: { backgroundColor: `${c.surfaceTint}33` },
    title: { fontFamily: fonts.headline, fontSize: 34, lineHeight: 38, letterSpacing: -1, textAlign: "center", color: c.primary },
    center: { textAlign: "center", fontSize: 19, lineHeight: 26 },
    card: { borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.surfaceContainerLowest },
    cardRow: { gap: 6, padding: 22 },
    cardRowLow: { backgroundColor: `${c.surfaceContainerLow}AA` },
    big: { fontFamily: fonts.headline, fontSize: 22, color: c.onSurface },
    manifest: { gap: 14, padding: 22, borderRadius: radius.xl, backgroundColor: c.surfaceContainerHigh },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 16 },
    roaster: { fontFamily: fonts.title, fontSize: 16, color: c.primary },
  }),
);
