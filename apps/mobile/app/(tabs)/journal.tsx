import { useQuery } from "@tanstack/react-query";
import { BREW_METHOD_LABELS, brewRatio, formatDuration, radius } from "@propperbrew/shared";
import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/session";
import { fonts, themed } from "@/theme";
import { useTRPC, type RouterOutputs } from "@/trpc";
import { Body, Button, Eyebrow, Frame, GUTTER, Headline, Loading, Stars } from "@/ui";

const REST_LABEL = { resting: "Resting", peak: "At its peak", past_peak: "Past peak" } as const;
const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
type Brew = RouterOutputs["brews"]["list"]["brews"][number];

/** Your journal: the bags on your shelf, and every brew you've logged. */
export default function JournalScreen() {
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const shelf = useQuery({ ...trpc.shelf.list.queryOptions(), enabled: !!session });
  const journal = useQuery({ ...trpc.brews.list.queryOptions(), enabled: !!session });
  const styles = useStyles();

  if (!ready || (session && (shelf.isPending || journal.isPending))) return <Loading />;
  if (!session || shelf.error || journal.error) {
    return (
      <View style={styles.message}>
        <Body italic muted>
          Your journal tracks each bag from roast date to its peak, and every brew you make with it.
        </Body>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to see your journal" />
        </Link>
      </View>
    );
  }
  const { brews, stats } = journal.data!;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.stats}>
        {[
          { label: "This week", value: String(stats.thisWeek) },
          { label: stats.total === 1 ? "Brew" : "Brews", value: String(stats.total) },
          { label: "Favourite", value: stats.favouriteMethod ? BREW_METHOD_LABELS[stats.favouriteMethod] : "—" },
        ].map((s) => (
          <View key={s.label} accessible aria-label={`${s.label}: ${s.value}`} style={styles.stat}>
            <Text style={[styles.statValue, s.value.length > 4 && styles.statWord]} numberOfLines={2}>
              {s.value}
            </Text>
            <Eyebrow>{s.label}</Eyebrow>
          </View>
        ))}
      </View>

      <View role="region" aria-label="On your shelf" style={styles.section}>
        <Headline size="section">On your shelf</Headline>
        {shelf.data!.length === 0 ? (
          <Body muted>Scan a bag or add a coffee to start your shelf.</Body>
        ) : (
          shelf.data!.map((item) => (
            <View key={item.id} style={styles.entry}>
              <Frame uri={item.bean.imageUrl} style={styles.thumb} />
              <View style={styles.body}>
                {item.rest && <Eyebrow style={styles.state}>{REST_LABEL[item.rest.state]}</Eyebrow>}
                <Headline>{item.bean.name}</Headline>
                {item.rest ? (
                  <Body muted>Day {item.rest.daysSinceRoast} post-roast</Body>
                ) : (
                  <Body italic muted>
                    Add a roast date to track resting
                  </Body>
                )}
                {item.brewCount > 0 && <Body muted style={{ fontSize: 15 }}>{item.brewCount === 1 ? "1 brew" : `${item.brewCount} brews`}</Body>}
                <View style={styles.actions}>
                  <Link
                    href={{ pathname: "/brew/new", params: { beanId: item.bean.id, beanName: item.bean.name, shelfEntryId: item.id } }}
                    asChild
                  >
                    <Pressable role="link" aria-label={`Log a brew of ${item.bean.name}`} style={styles.prompt}>
                      <Text style={styles.promptText}>Log a brew</Text>
                    </Pressable>
                  </Link>
                  {/* Once it's ready to drink, ask how it was (until they've said). */}
                  {item.rest && item.rest.state !== "resting" && !item.reviewed && (
                    <Link
                      href={{ pathname: "/review/[roaster]/[bean]", params: { roaster: item.bean.roaster.slug, bean: item.bean.slug } }}
                      asChild
                    >
                      <Pressable role="link" aria-label={`How was ${item.bean.name}? Review it`} style={styles.prompt}>
                        <Text style={styles.promptText}>How was it? Review →</Text>
                      </Pressable>
                    </Link>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <View role="region" aria-label="Recent brews" style={styles.section}>
        <Headline size="section">Recent brews</Headline>
        {brews.length === 0 ? (
          <Body muted>No brews yet. Log one from a bag on your shelf, or after brewing a recipe.</Body>
        ) : (
          brews.map((b) => <BrewRow key={b.id} brew={b} />)
        )}
      </View>
    </ScrollView>
  );
}

function BrewRow({ brew: b }: { brew: Brew }) {
  const styles = useStyles();
  const details = [
    `${b.coffeeDoseG}g → ${b.waterWeightG}g (${brewRatio(b.coffeeDoseG, b.waterWeightG)})`,
    b.waterTempC ? `${b.waterTempC}°C` : null,
    b.totalBrewTimeSeconds ? formatDuration(b.totalBrewTimeSeconds) : null,
    b.grindSetting,
  ].filter(Boolean);
  return (
    <Link href={{ pathname: "/brew/[id]", params: { id: b.id } }} asChild>
      <Pressable role="link" aria-label={`${BREW_METHOD_LABELS[b.brewMethod]}, ${b.bean.name}, ${when.format(b.brewedAt)}`} style={styles.brew}>
        <View style={styles.brewHead}>
          <Text style={styles.brewMethod}>{BREW_METHOD_LABELS[b.brewMethod]}</Text>
          <Eyebrow>{when.format(b.brewedAt)}</Eyebrow>
        </View>
        <Body style={{ fontSize: 16 }}>{b.bean.name}</Body>
        <Body muted style={{ fontSize: 14 }}>
          {details.join(" · ")}
        </Body>
        {b.rating ? <Stars value={b.rating} /> : null}
        {b.notes ? (
          <Body italic muted numberOfLines={2} style={{ fontSize: 15 }}>
            {b.notes}
          </Body>
        ) : null}
      </Pressable>
    </Link>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 40 },
    message: { padding: GUTTER, gap: 24 },
    stats: { flexDirection: "row", gap: 4 },
    stat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 18, paddingHorizontal: 6, backgroundColor: c.surfaceContainerLow, borderRadius: radius.md },
    statValue: { fontFamily: fonts.title, fontSize: 22, color: c.primary, textAlign: "center" },
    // A method's name rather than a number.
    statWord: { fontSize: 15, lineHeight: 19 },
    section: { gap: 16 },
    entry: { flexDirection: "row", alignItems: "center", gap: 20, padding: 16, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    thumb: { width: 72 },
    body: { flex: 1, gap: 4 },
    state: { fontFamily: fonts.labelBold, color: c.secondary },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
    prompt: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: c.secondaryContainer },
    promptText: { fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: c.onSecondaryContainer },
    brew: { gap: 6, padding: 18, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLowest },
    brewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    brewMethod: { fontFamily: fonts.title, fontSize: 18, color: c.primary },
  }),
);
