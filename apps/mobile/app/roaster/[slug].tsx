import { MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { formatPriceFrom, humanize, notesSentence, radius } from "@propperbrew/shared";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Chip, Eyebrow, Frame, GUTTER, Headline, Loading, Rating } from "@/ui";

/** A roaster's page (Stitch "Roaster Profile"): who they are, and their current roasts. */
export default function RoasterScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const trpc = useTRPC();
  const roaster = useQuery(trpc.roasters.bySlug.queryOptions({ slug }));
  const styles = useStyles();
  const colors = useColors();
  const dark = useColorScheme() === "dark";

  if (roaster.isPending) return <Loading />;
  if (!roaster.data) return <Body style={{ padding: GUTTER }}>Roaster not found.</Body>;
  const r = roaster.data;
  const hero = r.heroImageUrl ?? r.coffees.find((c) => c.imageUrl)?.imageUrl ?? null;
  const ink = dark ? colors.onSurface : "#ffffff";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View>
        <Frame uri={hero} aspectRatio={4 / 5} />
        <LinearGradient
          colors={["transparent", dark ? `${colors.surface}E6` : `${colors.primary}B3`]}
          locations={[0.4, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]}
        />
        <View style={styles.heroText}>
          {r.logoUrl ? <Image source={{ uri: r.logoUrl }} accessibilityLabel={`${r.name} logo`} style={styles.logo} resizeMode="contain" /> : null}
          {r.establishedYear ? <Text style={[styles.established, { color: ink }]}>Established {r.establishedYear}</Text> : null}
          <Text role="heading" style={[styles.name, { color: ink }]}>
            {r.name}
          </Text>
          {r.city ? <Chip small pill label={r.city} /> : null}
        </View>
      </View>

      {r.tagline || r.bio ? (
        <View style={{ gap: 16 }}>
          <Headline size="section">Our Philosophy</Headline>
          {r.tagline ? <Text style={styles.quote}>“{r.tagline}”</Text> : null}
          {r.bio ? <Body muted>{r.bio}</Body> : null}
        </View>
      ) : null}

      <View style={{ gap: 24 }}>
        <Headline size="section">Current Roasts</Headline>
        {r.coffees.length === 0 ? (
          <Body muted>No coffees on PropperBrew yet.</Body>
        ) : (
          r.coffees.map((c) => (
            <Link key={c.id} href={{ pathname: "/bean/[roaster]/[bean]", params: { roaster: r.slug, bean: c.slug } }} asChild>
              <Pressable style={styles.roast}>
                <Frame uri={c.imageUrl} aspectRatio={4 / 5} fit="contain" style={styles.roastImage} />
                <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
                  {c.roastLevel && <Chip small label={`${humanize(c.roastLevel)} roast`} />}
                  <Text style={styles.roastName}>{c.name}</Text>
                  {c.tastingNotes.length > 0 && (
                    <Body muted style={{ fontSize: 14, lineHeight: 19 }}>
                      {notesSentence(c.tastingNotes)}
                    </Body>
                  )}
                  {c.avgRating !== null && <Rating value={c.avgRating} count={c.reviewCount} />}
                  <Text style={styles.roastPrice}>{c.fromPricePence !== null ? formatPriceFrom(c.fromPricePence, c.priceCount) : "Sold out"}</Text>
                </View>
              </Pressable>
            </Link>
          ))
        )}
      </View>

      {r.address || r.websiteUrl ? (
        <View style={{ gap: 16 }}>
          <Headline size="section">Visit the Roastery</Headline>
          <View style={styles.visit}>
            {r.address ? (
              <View style={styles.visitLine}>
                <MaterialIcons name="location-on" size={20} color={colors.primary} />
                <Body style={{ flex: 1 }}>{r.address}</Body>
              </View>
            ) : null}
            {r.websiteUrl ? (
              <Pressable role="link" onPress={() => WebBrowser.openBrowserAsync(r.websiteUrl!)}>
                <Eyebrow style={styles.website}>{new URL(r.websiteUrl).hostname} →</Eyebrow>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 48 },
    logo: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: "#fff", marginBottom: 8 },
    heroText: { position: "absolute", left: 28, right: 28, bottom: 28, gap: 8, alignItems: "flex-start" },
    established: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.85 },
    name: { fontFamily: fonts.headline, fontSize: 36, lineHeight: 40, letterSpacing: -1.5 },
    quote: { fontFamily: fonts.bodyItalic, fontSize: 22, lineHeight: 32, color: c.primary },
    roast: { flexDirection: "row", gap: 20, alignItems: "center" },
    roastImage: { width: "38%", backgroundColor: c.surfaceContainerLowest },
    roastName: { fontFamily: fonts.title, fontSize: 19, lineHeight: 23, color: c.primary },
    roastPrice: { fontFamily: fonts.title, fontSize: 16, color: c.onSurface, marginTop: 4 },
    visit: { gap: 16, padding: 24, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    visitLine: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    website: { color: c.primary, fontFamily: fonts.labelBold },
  }),
);
