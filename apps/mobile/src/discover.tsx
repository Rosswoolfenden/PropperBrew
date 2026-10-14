import { formatPriceFrom, humanize, notesSentence, radius } from "@propperbrew/shared";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from "react-native";
import { fonts, themed, useColors } from "./theme";
import type { RouterOutputs } from "./trpc";
import { Body, Chip, Eyebrow, Frame, GUTTER, Headline } from "./ui";

export type DiscoverRoaster = RouterOutputs["roasters"]["discover"][number];
type Coffee = DiscoverRoaster["coffees"][number];

const CARD_WIDTH = 224;
const CARD_GAP = 16;
const SPOTLIGHT_GAP = 12;

const pad = (n: number) => String(n).padStart(2, "0");
const coffeeCount = (n: number) => `${n} ${n === 1 ? "coffee" : "coffees"}`;
/** A roaster's photo: their newest coffee that has one. */
const roasterImage = (r: DiscoverRoaster) => r.coffees.find((c) => c.imageUrl)?.imageUrl ?? null;
const beanHref = (roasterSlug: string, beanSlug: string) =>
  ({ pathname: "/bean/[roaster]/[bean]", params: { roaster: roasterSlug, bean: beanSlug } }) as const;

/** Small uppercase link with a leading rule ("—— READ THE JOURNAL"). */
function RuleLink({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable role="button" onPress={onPress} style={styles.ruleLink}>
      <View style={styles.rule} />
      <Text style={styles.ruleLabel}>{label}</Text>
    </Pressable>
  );
}

/** Swipe through roasters; the one on screen gets its bio and a link to its coffees underneath. */
export function RoasterSpotlight({ roasters, onSelect }: { roasters: DiscoverRoaster[]; onSelect: (roasterId: string) => void }) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const cardWidth = width - GUTTER * 2;
  const interval = cardWidth + SPOTLIGHT_GAP;
  const current = roasters[index];

  return (
    <View style={{ gap: 20 }}>
      <View style={[styles.spaced, { paddingHorizontal: GUTTER }]}>
        <Eyebrow>Roaster spotlight</Eyebrow>
        <Eyebrow style={styles.counter}>
          {pad(index + 1)} / {pad(roasters.length)}
        </Eyebrow>
      </View>
      <FlatList
        horizontal
        data={roasters}
        keyExtractor={(r) => r.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={(e) => setIndex(Math.min(roasters.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / interval))))}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: SPOTLIGHT_GAP }}
        renderItem={({ item }) => <SpotlightCard roaster={item} width={cardWidth} onPress={() => onSelect(item.id)} />}
      />
      {current && (
        <View style={{ paddingHorizontal: GUTTER, gap: 16 }}>
          {current.bio && <Text style={styles.bio}>{current.bio}</Text>}
          <RuleLink label="See their coffees" onPress={() => onSelect(current.id)} />
        </View>
      )}
    </View>
  );
}

function SpotlightCard({ roaster, width, onPress }: { roaster: DiscoverRoaster; width: number; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const dark = useColorScheme() === "dark";
  // Design: primary at 60% over the photo in light mode, near-black at 90% in dark.
  const scrim = dark ? `${colors.surface}E6` : `${colors.primary}99`;
  const ink = dark ? colors.onSurface : "#ffffff";

  return (
    <Pressable role="button" aria-label={`${roaster.name}, see their coffees`} onPress={onPress} style={{ width }}>
      <Frame uri={roasterImage(roaster)} aspectRatio={4 / 5} />
      <LinearGradient colors={["transparent", scrim]} locations={[0.35, 1]} style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]} />
      <View style={styles.spotlightText}>
        <Text style={[styles.spotlightName, { color: ink }]}>{roaster.name}</Text>
        {roaster.city && <Text style={[styles.spotlightCity, { color: ink }]}>{roaster.city}</Text>}
      </View>
    </Pressable>
  );
}

/** "The Collection": every roaster in an offset two-column grid. */
export function RoasterCollection({ roasters, onSelect }: { roasters: DiscoverRoaster[]; onSelect: (roasterId: string) => void }) {
  const styles = useStyles();
  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 32 }}>
      <Headline size="section">The Collection</Headline>
      <View style={styles.grid}>
        {roasters.map((r, i) => (
          <Pressable
            key={r.id}
            role="button"
            aria-label={`${r.name}, see their coffees`}
            onPress={() => onSelect(r.id)}
            // Right-hand column sits lower, for the design's intentional asymmetry.
            style={[styles.gridItem, i % 2 === 1 && { marginTop: 32 }]}
          >
            <Frame uri={roasterImage(r)} aspectRatio={3 / 4} style={{ marginBottom: 12 }} />
            <Text style={styles.gridName}>{r.name}</Text>
            {r.city && (
              <Body italic muted style={{ fontSize: 14, lineHeight: 18 }}>
                {r.city}
              </Body>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** The newest coffees across all roasters, as image-beside-details rows ("Seasonal Harvest" in the design). */
export function NewArrivals({ roasters, count = 4 }: { roasters: DiscoverRoaster[]; count?: number }) {
  const styles = useStyles();
  const newest = roasters
    .flatMap((r) => r.coffees.map((coffee) => ({ coffee, roaster: r })))
    .sort((a, b) => b.coffee.addedAt.getTime() - a.coffee.addedAt.getTime())
    .slice(0, count);

  return (
    <View role="region" aria-label="New arrivals" style={{ paddingHorizontal: GUTTER, gap: 32 }}>
      <Headline size="section">New arrivals</Headline>
      {newest.map(({ coffee, roaster }) => (
        <Link key={coffee.id} href={beanHref(roaster.slug, coffee.slug)} asChild>
          <Pressable style={styles.arrival}>
            <Frame uri={coffee.imageUrl} style={styles.arrivalImage} />
            <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
              {coffee.roastLevel && <Chip small label={`${humanize(coffee.roastLevel)} roast`} />}
              <Text style={styles.arrivalName}>{coffee.name}</Text>
              <Body muted style={{ fontSize: 14, lineHeight: 19 }}>
                {[roaster.name, coffee.tastingNotes.length > 0 && notesSentence(coffee.tastingNotes)].filter(Boolean).join(" · ")}
              </Body>
              <Text style={styles.arrivalPrice}>{formatPriceFrom(coffee.fromPricePence, coffee.priceCount)}</Text>
            </View>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

/** One roaster's coffees as a horizontally scrolling row (a "curated collection" in the design). */
export function RoasterRow({ roaster }: { roaster: DiscoverRoaster }) {
  return (
    <View role="region" aria-label={`${roaster.name} coffees`} style={{ gap: 24 }}>
      <View style={{ paddingHorizontal: GUTTER, gap: 2 }}>
        <Headline size="section">{roaster.name}</Headline>
        {roaster.city && (
          <Body italic muted>
            {roaster.city}
          </Body>
        )}
        <Eyebrow style={{ marginTop: 8 }}>{coffeeCount(roaster.coffeeCount)}</Eyebrow>
      </View>
      <FlatList
        horizontal
        data={roaster.coffees}
        keyExtractor={(c) => c.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: CARD_GAP }}
        renderItem={({ item }) => <CoffeeCard coffee={item} roasterSlug={roaster.slug} />}
      />
    </View>
  );
}

function CoffeeCard({ coffee, roasterSlug }: { coffee: Coffee; roasterSlug: string }) {
  const styles = useStyles();
  const meta = [coffee.originCountry, coffee.process && humanize(coffee.process)].filter(Boolean).join(" • ");
  return (
    <Link href={beanHref(roasterSlug, coffee.slug)} asChild>
      <Pressable style={styles.card}>
        <Frame uri={coffee.imageUrl} aspectRatio={4 / 5} fit="contain" style={styles.cardFrame} />
        <View style={styles.spaced}>
          <Text style={styles.cardName} numberOfLines={2}>
            {coffee.name}
          </Text>
          <Text style={styles.cardPrice}>{formatPriceFrom(coffee.fromPricePence, coffee.priceCount)}</Text>
        </View>
        {meta ? <Eyebrow>{meta}</Eyebrow> : null}
        {coffee.tastingNotes.length > 0 && (
          <View style={styles.chips}>
            {coffee.tastingNotes.slice(0, 2).map((n) => (
              <Chip key={n} small pill label={n} />
            ))}
          </View>
        )}
      </Pressable>
    </Link>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    spaced: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    counter: { color: c.primary },
    spotlightText: { position: "absolute", left: 32, right: 32, bottom: 32, gap: 4 },
    spotlightName: { fontFamily: fonts.headline, fontSize: 34, lineHeight: 36, letterSpacing: -1.5 },
    spotlightCity: { fontFamily: fonts.bodyItalic, fontSize: 18, opacity: 0.9 },
    bio: { fontFamily: fonts.body, fontSize: 20, lineHeight: 30, color: c.onSurface, opacity: 0.8 },
    ruleLink: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 4 },
    rule: { width: 32, height: StyleSheet.hairlineWidth * 2, backgroundColor: c.primary },
    ruleLabel: { fontFamily: fonts.labelBold, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: c.primary },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 40 },
    gridItem: { width: "47.5%" },
    gridName: { fontFamily: fonts.title, fontSize: 18, lineHeight: 22, color: c.onSurface },
    arrival: { flexDirection: "row", alignItems: "center", gap: 24 },
    arrivalImage: {
      width: "33%",
      backgroundColor: c.surfaceContainerLowest,
      shadowColor: c.onSurface,
      shadowOpacity: 0.04,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 4 },
    },
    arrivalName: { fontFamily: fonts.title, fontSize: 20, lineHeight: 24, color: c.primary },
    arrivalPrice: { fontFamily: fonts.title, fontSize: 18, color: c.onSurface, marginTop: 6 },
    card: { width: CARD_WIDTH, gap: 6 },
    cardFrame: { backgroundColor: c.surfaceContainerLowest, marginBottom: 10 },
    cardName: { flex: 1, fontFamily: fonts.title, fontSize: 17, lineHeight: 21, color: c.primary },
    cardPrice: { fontFamily: fonts.labelBold, fontSize: 12, color: c.secondary },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingTop: 4 },
  }),
);
