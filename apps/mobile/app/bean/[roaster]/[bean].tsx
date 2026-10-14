import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatAltitude, formatPriceFrom, humanize, possessive, radius, type BrewMethod } from "@propperbrew/shared";
import { ORDER_BAR_HEIGHT, OrderBar, SizeOptions } from "@/order";
import { RecipeCard } from "@/recipe-card";
import { fonts, themed } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Chip, Eyebrow, FilterChip, Frame, GUTTER, Headline, Loading, Rating } from "@/ui";

const METHOD_FILTERS: { label: string; value?: BrewMethod }[] = [
  { label: "All" },
  { label: "V60", value: "v60" },
  { label: "Espresso", value: "espresso" },
  { label: "AeroPress", value: "aeropress" },
];

export default function BeanScreen() {
  const { roaster, bean: beanSlug } = useLocalSearchParams<{ roaster: string; bean: string }>();
  const trpc = useTRPC();
  const [method, setMethod] = useState<BrewMethod | undefined>();
  const [variantId, setVariantId] = useState<string>();
  const [quantity, setQuantity] = useState(1);
  const styles = useStyles();

  const bean = useQuery(trpc.beans.bySlug.queryOptions({ roasterSlug: roaster, beanSlug }));
  const recipes = useQuery({
    ...trpc.recipes.forBean.queryOptions({ coffeeBeanId: bean.data?.id ?? "", brewMethod: method, limit: 10 }),
    enabled: !!bean.data,
  });
  const addToShelf = useMutation(
    trpc.shelf.add.mutationOptions({ onSuccess: () => Alert.alert("Added to your shelf") }),
  );

  if (bean.isPending) return <Loading />;
  if (!bean.data) return <Body style={{ padding: GUTTER }}>Coffee not found.</Body>;
  const b = bean.data;
  // Variants come cheapest first; default to that one until the buyer picks.
  const variant = b.variants.find((v) => v.id === variantId) ?? b.variants[0];
  const checkout = variant && b.checkoutDomain ? { variant, domain: b.checkoutDomain } : null;
  // The API puts the roaster's recommendations first.
  const roasterPicks = recipes.data?.filter((r) => r.author.type === "roaster") ?? [];
  const community = recipes.data?.filter((r) => r.author.type === "user") ?? [];

  const prices = b.variants.map((v) => v.pricePence);
  const subtitle = [b.originCountry, b.roastLevel && `${humanize(b.roastLevel)} roast`].filter(Boolean).join(" • ");
  const specs: [string, string | null][] = [
    ["Roaster", b.roaster.name],
    ["Region", [b.region, b.originCountry].filter(Boolean).join(", ") || null],
    ["Producer", b.producer],
    ["Altitude", b.altitudeMasl ? formatAltitude(b.altitudeMasl) : null],
    ["Process", b.process && humanize(b.process)],
    ["Varietals", b.varietals.join(", ") || null],
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.container, checkout && { paddingBottom: ORDER_BAR_HEIGHT + 48 }]}>
        <Frame uri={b.imageUrl} aspectRatio={4 / 5} />

        <View style={styles.block}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Headline size="display">{b.name}</Headline>
            </View>
            {variant && <Text style={styles.price}>{formatPriceFrom(Math.min(...prices), new Set(prices).size)}</Text>}
          </View>
          {subtitle ? (
            <Body italic muted style={{ fontSize: 18 }}>
              {subtitle}
            </Body>
          ) : null}
          {b.avgRating !== null && <Rating value={b.avgRating} count={b.reviewCount} />}
          {b.tastingNotes.length > 0 && (
            <View style={styles.wrap}>
              {b.tastingNotes.map((n) => (
                <Chip key={n} label={n} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.specs}>
          {specs
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <View key={k} style={styles.spec}>
                <Text style={styles.specLabel}>{k}</Text>
                <Text style={styles.specValue}>{v}</Text>
              </View>
            ))}
        </View>

        <Button label="Add to my shelf" icon="inventory-2" variant="secondary" onPress={() => addToShelf.mutate({ coffeeBeanId: b.id })} />

        <View style={styles.block}>
          <Headline size="section">Order</Headline>
          {variant === undefined ? (
            <Body italic muted style={styles.note}>
              Sold out — reviews and recipes stay here for reference.
            </Body>
          ) : (
            <>
              <SizeOptions variants={b.variants} selectedId={variant.id} onSelect={setVariantId} />
              {checkout ? (
                <Body italic muted style={{ fontSize: 15 }}>
                  You&apos;ll check out on {possessive(b.roaster.name)} own shop.
                </Body>
              ) : (
                <Body italic muted style={styles.note}>
                  Ordering isn&apos;t available from this roaster yet.
                </Body>
              )}
            </>
          )}
        </View>

        <View style={styles.block}>
          <Headline size="section">Brewing guide</Headline>
          <View style={styles.wrap}>
            {METHOD_FILTERS.map((f) => (
              <FilterChip key={f.label} label={f.label} selected={method === f.value} onPress={() => setMethod(f.value)} />
            ))}
          </View>
          {recipes.data?.length === 0 && <Body muted>No recipes yet.</Body>}
          {roasterPicks.length > 0 && (
            <View role="region" aria-label="From the roaster" style={styles.recipeGroup}>
              <Eyebrow>From the roaster</Eyebrow>
              {roasterPicks.map((r) => (
                <RecipeCard key={r.id} recipe={r} />
              ))}
            </View>
          )}
          {community.length > 0 && (
            <View role="region" aria-label="From the community" style={styles.recipeGroup}>
              <Eyebrow>From the community</Eyebrow>
              {community.map((r) => (
                <RecipeCard key={r.id} recipe={r} />
              ))}
            </View>
          )}
          <Link href={{ pathname: "/recipe/new", params: { beanId: b.id, beanName: b.name } }} asChild>
            <Button label="Add your recipe" icon="add" variant="secondary" />
          </Link>
        </View>
      </ScrollView>
      {checkout && (
        <OrderBar
          variant={checkout.variant}
          quantity={quantity}
          onQuantityChange={setQuantity}
          checkoutDomain={checkout.domain}
        />
      )}
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 40 },
    block: { gap: 16 },
    titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
    price: { fontFamily: fonts.bodyItalic, fontSize: 20, lineHeight: 30, color: c.secondary },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    specs: { gap: 24 },
    spec: { flexDirection: "row", alignItems: "baseline", gap: 24 },
    specLabel: { width: "30%", fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: c.onSurfaceVariant, opacity: 0.6 },
    // Ghost border: outline-variant at 20%.
    specValue: { flex: 1, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: `${c.outlineVariant}33`, fontFamily: fonts.body, fontSize: 18, color: c.primary },
    note: { padding: 20, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow, overflow: "hidden" },
    recipeGroup: { gap: 16, marginTop: 8 },
  }),
);
