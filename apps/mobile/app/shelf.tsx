import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { radius } from "@propperbrew/shared";
import { fonts, themed } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Eyebrow, Frame, GUTTER, Headline, Loading } from "@/ui";

const REST_LABEL = { resting: "Resting", peak: "At its peak", past_peak: "Past peak" } as const;

export default function ShelfScreen() {
  const trpc = useTRPC();
  const shelf = useQuery(trpc.shelf.list.queryOptions());
  const styles = useStyles();

  if (shelf.isPending) return <Loading />;
  if (shelf.error) {
    return (
      <View style={styles.signedOut}>
        <Body italic muted>
          Your shelf tracks each bag from roast date to its peak.
        </Body>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to see your shelf" />
        </Link>
      </View>
    );
  }

  return (
    <FlatList
      data={shelf.data}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Body muted>Scan a bag or add a coffee to start your shelf.</Body>}
      renderItem={({ item }) => (
        <View style={styles.entry}>
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
      )}
    />
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    signedOut: { padding: GUTTER, gap: 24 },
    list: { padding: GUTTER, gap: 16 },
    entry: { flexDirection: "row", alignItems: "center", gap: 20, padding: 16, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    thumb: { width: 72 },
    body: { flex: 1, gap: 4 },
    state: { fontFamily: fonts.labelBold, color: c.secondary },
    prompt: { alignSelf: "flex-start", marginTop: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: c.secondaryContainer },
    promptText: { fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: c.onSecondaryContainer },
  }),
);
