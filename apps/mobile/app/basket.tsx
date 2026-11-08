import { MaterialIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, humanize, MAX_ORDER_QUANTITY, radius } from "@propperbrew/shared";
import { Link, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/session";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC, type RouterOutputs } from "@/trpc";
import { Body, Button, Chip, Eyebrow, Frame, GUTTER, Headline, Loading } from "@/ui";

type Basket = RouterOutputs["basket"]["get"];
type Item = Basket["groups"][number]["items"][number];

/** Stitch Cart ("Your Selection"): coffees from every roaster, one checkout. */
export default function BasketScreen() {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const styles = useStyles();
  const basket = useQuery({ ...trpc.basket.get.queryOptions(), enabled: !!session });
  const setQuantity = useMutation(
    trpc.basket.setQuantity.mutationOptions({ onSuccess: (data) => queryClient.setQueryData(trpc.basket.get.queryKey(), data) }),
  );

  if (!ready || (session && basket.isPending)) return <Loading />;
  if (!session) {
    return (
      <View style={styles.message}>
        <Body italic muted>
          Your basket holds coffees from any roaster, for one checkout.
        </Body>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to see your basket" />
        </Link>
      </View>
    );
  }
  if (basket.error) {
    return (
      <View style={styles.message}>
        <Body muted>We couldn&apos;t load your basket.</Body>
        <Button label="Try again" variant="secondary" onPress={() => basket.refetch()} />
      </View>
    );
  }
  const b = basket.data!;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={{ gap: 6 }}>
        <Headline size="display">Your Selection</Headline>
        <Eyebrow>Coffees from independent roasters, in one checkout</Eyebrow>
      </View>
      {b.groups.length === 0 ? (
        <View style={{ gap: 16 }}>
          <Body italic muted>
            Your basket is empty.
          </Body>
          <Button label="Find a coffee" variant="secondary" onPress={() => router.push("/search")} />
        </View>
      ) : (
        <>
          {b.groups.map((group) => (
            <View key={group.roaster.id} role="region" aria-label={`From ${group.roaster.name}`} style={{ gap: 28 }}>
              <Headline size="section">From {group.roaster.name}</Headline>
              {group.items.map((item) => (
                <BasketItem
                  key={item.variantId}
                  item={item}
                  busy={setQuantity.isPending}
                  onQuantity={(quantity) => setQuantity.mutate({ variantId: item.variantId, quantity })}
                />
              ))}
            </View>
          ))}

          <View role="region" aria-label="Order summary" style={styles.summary}>
            <Headline>Order Summary</Headline>
            <Line label="Subtotal" value={formatGbp(b.subtotalPence)} />
            {b.groups.map((g) =>
              g.subtotalPence > 0 ? <Line key={g.roaster.id} label={`Delivery from ${g.roaster.name}`} value={g.shippingPence === 0 ? "Free" : formatGbp(g.shippingPence)} /> : null,
            )}
            <Line label="Total" value={formatGbp(b.totalPence)} total />
            <Body muted style={{ fontSize: 14 }}>
              Prices include VAT.
            </Body>
            <Button label="Proceed to checkout" disabled={b.hasUnavailable || b.count === 0} onPress={() => router.push("/checkout")} />
            <Button label="Continue browsing" variant="secondary" onPress={() => router.navigate("/")} />
            {b.groups.map((g) => {
              const threshold = g.roaster.freeShippingThresholdPence;
              if (threshold === null || g.shippingPence === 0 || g.subtotalPence === 0) return null;
              return (
                <View key={g.roaster.id} style={styles.nudge}>
                  <MaterialIcons name="local-shipping" size={20} color={styles.nudgeText.color} />
                  <Text style={styles.nudgeText}>
                    Add {formatGbp(threshold - g.subtotalPence)} more from {g.roaster.name} for free delivery.
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function BasketItem({ item, busy, onQuantity }: { item: Item; busy: boolean; onQuantity: (quantity: number) => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View role="listitem" aria-label={item.bean.name} style={[{ gap: 14 }, !item.available && { opacity: 0.6 }]}>
      <Frame uri={item.bean.imageUrl} aspectRatio={4 / 3} fit="contain" />
      <View style={styles.itemHead}>
        {item.bean.originCountry ? <Chip small label={item.bean.originCountry} /> : <View />}
        <Text style={styles.price}>{formatGbp(item.unitPricePence * item.quantity)}</Text>
      </View>
      <Text style={styles.name}>{item.bean.name}</Text>
      <Eyebrow>{[item.variantTitle, item.bean.roastLevel && `${humanize(item.bean.roastLevel)} roast`].filter(Boolean).join(" · ")}</Eyebrow>
      {!item.available && (
        <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
          No longer available. Remove it to check out.
        </Text>
      )}
      <View style={styles.itemActions}>
        <View role="group" aria-label={`Quantity of ${item.bean.name}`} style={styles.stepper}>
          <Pressable role="button" aria-label="Fewer" disabled={busy || item.quantity <= 1} onPress={() => onQuantity(item.quantity - 1)} style={styles.step}>
            <MaterialIcons name="remove" size={18} color={colors.primary} style={{ opacity: item.quantity <= 1 ? 0.3 : 1 }} />
          </Pressable>
          <Text style={styles.quantity}>{String(item.quantity).padStart(2, "0")}</Text>
          <Pressable
            role="button"
            aria-label="More"
            disabled={busy || !item.available || item.quantity >= MAX_ORDER_QUANTITY}
            onPress={() => onQuantity(item.quantity + 1)}
            style={styles.step}
          >
            <MaterialIcons name="add" size={18} color={colors.primary} />
          </Pressable>
        </View>
        <Pressable role="button" aria-label={`Remove ${item.bean.name}`} disabled={busy} onPress={() => onQuantity(0)} hitSlop={8}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Line({ label, value, total }: { label: string; value: string; total?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.line, total && { marginTop: 12 }]}>
      <Text style={[styles.lineLabel, total && styles.totalLabel]}>{label}</Text>
      <Text style={[styles.lineValue, total && styles.totalValue]}>{value}</Text>
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 48 },
    message: { padding: GUTTER, gap: 24 },
    itemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    price: { fontFamily: fonts.title, fontSize: 18, color: c.primary },
    name: { fontFamily: fonts.bodyItalic, fontSize: 28, lineHeight: 32, color: c.onSurface },
    itemActions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    stepper: { flexDirection: "row", alignItems: "center", height: 44, borderRadius: radius.md, backgroundColor: c.surfaceContainerHighest },
    step: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
    quantity: { width: 28, textAlign: "center", fontFamily: fonts.labelBold, fontSize: 15, color: c.primary },
    remove: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: c.onSurfaceVariant },
    summary: { gap: 14, padding: 24, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 16 },
    lineLabel: { flex: 1, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: c.onSurfaceVariant },
    lineValue: { fontFamily: fonts.title, fontSize: 16, color: c.primary },
    totalLabel: { fontFamily: fonts.labelBold, fontSize: 14, color: c.onSurface },
    totalValue: { fontFamily: fonts.headline, fontSize: 24 },
    nudge: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: `${c.secondaryContainer}99` },
    nudgeText: { flex: 1, fontFamily: fonts.label, fontSize: 12, lineHeight: 17, color: c.onSecondaryContainer },
  }),
);
