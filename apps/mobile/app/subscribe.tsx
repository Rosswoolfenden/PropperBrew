import { useMutation, useQuery } from "@tanstack/react-query";
import { deliveryNote, formatGbp, intervalLabel, MAX_ORDER_QUANTITY, radius, ShippingAddress, shippingFor, SUBSCRIPTION_INTERVALS, type SubscriptionInterval } from "@propperbrew/shared";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SizeOptions } from "@/order";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Eyebrow, Field, FilterChip, GUTTER, Headline, Loading } from "@/ui";

const FIELDS = [
  { key: "name", label: "Full name", error: "Enter your name" },
  { key: "line1", label: "Street address", error: "Enter your street address" },
  { key: "line2", label: "Flat, floor or building (optional)", error: "Keep this under 120 characters" },
  { key: "city", label: "Town or city", error: "Enter your town or city" },
  { key: "postcode", label: "Postcode", error: "Enter a UK postcode, like LS1 6DT" },
] as const;
type Key = (typeof FIELDS)[number]["key"];

/** A coffee every 2 or 4 weeks: size, how many, how often and where, then Stripe in the in-app browser. */
export default function SubscribeScreen() {
  const { roaster, bean: beanSlug } = useLocalSearchParams<{ roaster: string; bean: string }>();
  const trpc = useTRPC();
  const styles = useStyles();
  const colors = useColors();
  const bean = useQuery(trpc.beans.bySlug.queryOptions({ roasterSlug: roaster, beanSlug }));
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [weeks, setWeeks] = useState<SubscriptionInterval>(2);
  const [address, setAddress] = useState<Record<Key, string>>({ name: "", line1: "", line2: "", city: "", postcode: "" });
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const start = useMutation(
    trpc.subscriptions.start.mutationOptions({
      onSuccess: async ({ url }) => {
        await WebBrowser.openBrowserAsync(url);
        router.replace("/subscriptions");
      },
    }),
  );

  if (bean.isPending) return <Loading />;
  if (!bean.data || !bean.data.inAppCheckout || bean.data.variants.length === 0) {
    return <Body muted style={{ padding: GUTTER }}>This coffee can&apos;t be subscribed to here.</Body>;
  }
  const b = bean.data;
  const variant = b.variants.find((v) => v.id === variantId) ?? b.variants[0]!;
  const subtotal = variant.pricePence * quantity;
  const delivery = shippingFor(subtotal, b.roaster);

  const submit = () => {
    const result = ShippingAddress.safeParse(address);
    if (!result.success) {
      const found: Partial<Record<Key, string>> = {};
      for (const issue of result.error.issues) found[issue.path[0] as Key] ??= FIELDS.find((f) => f.key === issue.path[0])!.error;
      return setErrors(found);
    }
    setErrors({});
    start.mutate({ variantId: variant.id, quantity, intervalWeeks: weeks, address: result.data, client: "app" });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 8 }}>
        <Eyebrow>Subscribe</Eyebrow>
        <Headline size="display">{b.name}</Headline>
        <Body muted>{deliveryNote(b.roaster)}</Body>
      </View>
      <SizeOptions variants={b.variants} selectedId={variant.id} onSelect={setVariantId} />
      <View role="radiogroup" aria-label="Bags each time" style={{ gap: 8 }}>
        <Eyebrow>Bags each time</Eyebrow>
        <View style={styles.chips}>
          {[1, 2, 3, 4].filter((n) => n <= MAX_ORDER_QUANTITY).map((n) => (
            <FilterChip key={n} label={String(n)} selected={quantity === n} onPress={() => setQuantity(n)} />
          ))}
        </View>
      </View>
      <View role="radiogroup" aria-label="How often" style={{ gap: 8 }}>
        <Eyebrow>How often</Eyebrow>
        <View style={styles.chips}>
          {SUBSCRIPTION_INTERVALS.map((w) => (
            <FilterChip key={w} label={intervalLabel(w)} selected={weeks === w} onPress={() => setWeeks(w)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 16 }}>
        <Headline>Delivery address</Headline>
        {FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            autoCapitalize={f.key === "postcode" ? "characters" : "words"}
            value={address[f.key]}
            onChangeText={(t) => setAddress((a) => ({ ...a, [f.key]: t }))}
            error={errors[f.key]}
          />
        ))}
      </View>
      <View role="region" aria-label="Your subscription" style={styles.summary}>
        <Text style={styles.line}>
          {quantity} × {variant.title} · {formatGbp(subtotal)}
        </Text>
        <Text style={styles.line}>Delivery · {delivery === 0 ? "Free" : formatGbp(delivery)}</Text>
        <Text style={styles.total}>
          {intervalLabel(weeks)} · {formatGbp(subtotal + delivery)}
        </Text>
        <Body muted style={{ fontSize: 14 }}>
          Paid each time it&apos;s sent, at today&apos;s price. Pause or cancel whenever you like.
        </Body>
        {start.error && (
          <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
            {start.error.message}
          </Text>
        )}
        <Button label={start.isPending ? "Opening payment…" : `Subscribe · ${formatGbp(subtotal + delivery)}`} disabled={start.isPending} onPress={submit} />
      </View>
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 32 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    summary: { gap: 10, padding: 22, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    line: { fontFamily: fonts.title, fontSize: 15, color: c.onSurface },
    total: { fontFamily: fonts.headline, fontSize: 20, color: c.primary },
  }),
);
