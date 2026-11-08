import { useMutation, useQuery } from "@tanstack/react-query";
import { formatGbp, radius, ShippingAddress } from "@propperbrew/shared";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Eyebrow, Field, Frame, GUTTER, Headline, Loading } from "@/ui";

const FIELDS = [
  { key: "name", label: "Full name", autoComplete: "name", placeholder: "Jo Bloggs", error: "Enter your name" },
  { key: "line1", label: "Street address", autoComplete: "address-line1", placeholder: "12 Call Lane", error: "Enter your street address" },
  { key: "line2", label: "Flat, floor or building (optional)", autoComplete: "address-line2", placeholder: "Flat 3", error: "Keep this under 120 characters" },
  { key: "city", label: "Town or city", autoComplete: "postal-address-locality", placeholder: "Leeds", error: "Enter your town or city" },
  { key: "postcode", label: "Postcode", autoComplete: "postal-code", placeholder: "LS1 6DT", error: "Enter a UK postcode, like LS1 6DT" },
] as const;
type Key = (typeof FIELDS)[number]["key"];

/** Stitch Checkout: address and delivery here, then payment on Stripe's page in the in-app browser. */
export default function CheckoutScreen() {
  const trpc = useTRPC();
  const styles = useStyles();
  const colors = useColors();
  const basket = useQuery(trpc.basket.get.queryOptions());
  const [address, setAddress] = useState<Record<Key, string>>({ name: "", line1: "", line2: "", city: "", postcode: "" });
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const start = useMutation(
    trpc.orders.start.mutationOptions({
      onSuccess: async ({ url, checkoutId }) => {
        // Resolves when they close the browser (straight away on the web, where it opens a tab).
        await WebBrowser.openBrowserAsync(url);
        router.replace({ pathname: "/order/[id]", params: { id: checkoutId } });
      },
    }),
  );

  if (basket.isPending) return <Loading />;
  if (basket.error) return <Body muted style={{ padding: GUTTER }}>We couldn&apos;t load your basket.</Body>;
  const b = basket.data;

  const pay = () => {
    const result = ShippingAddress.safeParse(address);
    if (!result.success) {
      const found: Partial<Record<Key, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as Key;
        found[key] ??= FIELDS.find((f) => f.key === key)!.error;
      }
      return setErrors(found);
    }
    setErrors({});
    start.mutate({ address: result.data, client: "app" });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 20 }}>
        <Step title="Delivery Address" step="01" />
        {FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            autoComplete={f.autoComplete}
            autoCapitalize={f.key === "postcode" ? "characters" : "words"}
            value={address[f.key]}
            onChangeText={(text) => setAddress((a) => ({ ...a, [f.key]: text }))}
            error={errors[f.key]}
          />
        ))}
      </View>

      <View style={{ gap: 16 }}>
        <Step title="Delivery" step="02" />
        {b.groups.map((g) => (
          <View key={g.roaster.id} style={styles.delivery}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.deliveryName}>{g.roaster.name}</Text>
              <Body italic muted style={{ fontSize: 15 }}>
                Posted by the roaster · 2–5 working days
              </Body>
            </View>
            <Text style={styles.deliveryName}>{g.shippingPence === 0 ? "Free" : formatGbp(g.shippingPence)}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 12 }}>
        <Step title="Payment" step="03" />
        <Body muted>You&apos;ll pay on Stripe&apos;s secure page, by card, Apple Pay or Google Pay. Each roaster then posts their coffee to you.</Body>
      </View>

      <View role="region" aria-label="Your selection" style={styles.summary}>
        <Headline>Your Selection</Headline>
        {b.groups.flatMap((g) =>
          g.items.map((i) => (
            <View key={i.variantId} style={styles.item}>
              <Frame uri={i.bean.imageUrl} fit="contain" style={styles.thumb} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.itemName}>{i.bean.name}</Text>
                <Body italic muted style={{ fontSize: 14 }}>
                  {i.variantTitle} · {i.quantity === 1 ? "1 bag" : `${i.quantity} bags`}
                </Body>
              </View>
              <Text style={styles.itemName}>{formatGbp(i.unitPricePence * i.quantity)}</Text>
            </View>
          )),
        )}
        <View style={styles.line}>
          <Eyebrow>Subtotal</Eyebrow>
          <Text style={styles.itemName}>{formatGbp(b.subtotalPence)}</Text>
        </View>
        <View style={styles.line}>
          <Eyebrow>Delivery</Eyebrow>
          <Text style={styles.itemName}>{b.shippingPence === 0 ? "Free" : formatGbp(b.shippingPence)}</Text>
        </View>
        <View style={[styles.line, { marginTop: 8 }]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>{formatGbp(b.totalPence)}</Text>
        </View>
        {start.error && (
          <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
            {start.error.message}
          </Text>
        )}
        <Button
          label={start.isPending ? "Opening payment…" : `Pay ${formatGbp(b.totalPence)}`}
          disabled={start.isPending || b.count === 0 || b.hasUnavailable}
          onPress={pay}
        />
      </View>
    </ScrollView>
  );
}

function Step({ title, step }: { title: string; step: string }) {
  const styles = useStyles();
  return (
    <View style={styles.step}>
      <Text role="heading" style={styles.stepTitle}>
        {title}
      </Text>
      <Eyebrow>Step {step} / 03</Eyebrow>
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 48 },
    step: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    stepTitle: { flex: 1, fontFamily: fonts.headline, fontSize: 26, letterSpacing: -0.5, color: c.primary },
    delivery: { flexDirection: "row", alignItems: "center", gap: 16, padding: 20, borderRadius: radius.lg, backgroundColor: c.surfaceContainerLowest },
    deliveryName: { fontFamily: fonts.title, fontSize: 16, color: c.primary },
    summary: { gap: 16, padding: 24, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    item: { flexDirection: "row", alignItems: "center", gap: 14 },
    thumb: { width: 56, aspectRatio: 1, borderRadius: radius.lg },
    itemName: { fontFamily: fonts.title, fontSize: 15, color: c.primary },
    line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    totalLabel: { fontFamily: fonts.title, fontSize: 18, color: c.onSurface },
    total: { fontFamily: fonts.headline, fontSize: 24, color: c.primary },
  }),
);
