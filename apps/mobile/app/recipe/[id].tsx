import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BREW_METHOD_LABELS, formatDuration, radius } from "@propperbrew/shared";
import { activeStepIndex, BrewTimerCard, useBrewTimer } from "@/brew-timer";
import { fonts, themed } from "@/theme";
import { useTRPC } from "@/trpc";
import { UpvoteButton } from "@/upvote";
import { Body, Chip, Eyebrow, Frame, GUTTER, Headline, Loading } from "@/ui";

type Tile = { label: string; value: string; unit?: string };

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const recipe = useQuery(trpc.recipes.byId.queryOptions({ id }));
  const timer = useBrewTimer();
  const styles = useStyles();

  if (recipe.isPending) return <Loading />;
  if (!recipe.data) return <Body style={{ padding: GUTTER }}>Recipe not found.</Body>;
  const r = recipe.data;

  const totalSeconds = r.totalBrewTimeSeconds ?? r.steps.at(-1)?.time ?? null;
  const tiles: Tile[] = [
    { label: "Coffee dose", value: String(r.coffeeDoseG), unit: "g" },
    { label: "Total water", value: String(r.waterWeightG), unit: "g" },
    ...(r.waterTempC ? [{ label: "Temperature", value: String(r.waterTempC), unit: "°C" }] : []),
    ...(r.grindSetting || r.grinderModel
      ? [{ label: "Grind", value: [r.grindSetting, r.grinderModel && `on ${r.grinderModel}`].filter(Boolean).join(" ") }]
      : []),
    ...(totalSeconds ? [{ label: "Brew time", value: formatDuration(totalSeconds) }] : []),
  ];
  const active = timer.elapsed > 0 ? activeStepIndex(r.steps, timer.elapsed) : -1;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={{ gap: 16 }}>
        <View style={styles.byline}>
          <Eyebrow>{r.author.type === "roaster" ? "Roaster's pick" : `Recipe by ${r.author.username}`}</Eyebrow>
          <View style={styles.rule} />
          <Link href={{ pathname: "/bean/[roaster]/[bean]", params: { roaster: r.bean.roaster.slug, bean: r.bean.slug } }}>
            <Text style={styles.beanLink}>{r.bean.name}</Text>
          </Link>
        </View>
        <Text role="heading" style={styles.title}>
          {BREW_METHOD_LABELS[r.brewMethod]}
        </Text>
        <View style={styles.vote}>
          <UpvoteButton recipe={r} />
          <Body italic muted style={{ flex: 1 }}>
            {r.author.type === "roaster" ? `Recommended by ${r.author.name}. ` : ""}Tried it? Upvote it.
          </Body>
        </View>
      </View>

      <Frame uri={r.bean.imageUrl} aspectRatio={342 / 320} />
      {r.notes && <Body style={styles.lede}>{r.notes}</Body>}

      <View style={styles.tiles}>
        {tiles.map((t, i) => (
          // Alternating tones, as in the design's bento grid.
          <View key={t.label} style={[styles.tile, (i % 4 === 0 || i % 4 === 3) && styles.tileLight]}>
            <Eyebrow>{t.label}</Eyebrow>
            {t.unit ? (
              <Text style={styles.tileValue}>
                {t.value}
                <Text style={styles.tileUnit}> {t.unit}</Text>
              </Text>
            ) : (
              <Text style={styles.tileText}>{t.value}</Text>
            )}
          </View>
        ))}
      </View>

      {r.bean.tastingNotes.length > 0 && (
        <View style={{ gap: 20 }}>
          <Eyebrow>Anticipated profile</Eyebrow>
          <View style={styles.chips}>
            {r.bean.tastingNotes.map((n) => (
              <Chip key={n} label={n} />
            ))}
          </View>
        </View>
      )}

      {r.steps.length > 0 && (
        <View style={{ gap: 40 }}>
          <Headline size="section">The Ritual</Headline>
          {r.steps.map((step, i) => (
            <View key={i} style={styles.step} aria-current={i === active ? "step" : undefined}>
              <Text style={[styles.stepNumber, i === active && styles.stepNumberActive]}>{String(i + 1).padStart(2, "0")}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.stepTitle}>{step.title ?? `Step ${i + 1}`}</Text>
                <Eyebrow>{[formatDuration(step.time), step.water !== undefined && `to ${step.water}g`].filter(Boolean).join(" · ")}</Eyebrow>
                {step.note && <Body muted>{step.note}</Body>}
              </View>
            </View>
          ))}
        </View>
      )}

      <BrewTimerCard timer={timer} steps={r.steps} totalSeconds={totalSeconds} />
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 48 },
    vote: { flexDirection: "row", alignItems: "center", gap: 12 },
    byline: { flexDirection: "row", alignItems: "baseline", gap: 12 },
    rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: `${c.outlineVariant}33` },
    beanLink: { fontFamily: fonts.bodyItalic, fontSize: 16, color: c.secondary },
    title: { fontFamily: fonts.title, fontSize: 52, lineHeight: 56, letterSpacing: -1, color: c.primary },
    lede: { fontSize: 20, lineHeight: 30, color: c.onSurfaceVariant },
    tiles: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
    tile: {
      flexGrow: 1,
      flexBasis: "40%",
      minHeight: 160,
      padding: 24,
      justifyContent: "space-between",
      borderRadius: radius.xl,
      backgroundColor: c.surfaceContainerLow,
    },
    tileLight: { backgroundColor: c.surfaceContainerLowest },
    tileValue: { fontFamily: fonts.title, fontSize: 30, color: c.primary },
    tileUnit: { fontFamily: fonts.body, fontSize: 18, color: c.onSurfaceVariant },
    tileText: { fontFamily: fonts.body, fontSize: 20, lineHeight: 25, color: c.primary },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    step: { flexDirection: "row", gap: 28, alignItems: "flex-start" },
    stepNumber: { width: 64, fontFamily: fonts.headline, fontSize: 48, lineHeight: 48, color: `${c.outlineVariant}4D` },
    stepNumberActive: { color: c.primary },
    stepTitle: { fontFamily: fonts.title, fontSize: 20, lineHeight: 24, color: c.onSurface },
  }),
);
