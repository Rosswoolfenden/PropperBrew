import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { humanize } from "@propperbrew/shared";
import { themed } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Chip, Eyebrow, Frame, GUTTER, Headline, Rating } from "@/ui";

export default function DiscoverScreen() {
  const trpc = useTRPC();
  const beans = useQuery(trpc.beans.search.queryOptions({ inStockOnly: true, limit: 30 }));
  const s = useStyles();

  const header = (
    <View style={s.header}>
      <Eyebrow>UK specialty coffee</Eyebrow>
      <Headline size="display">Fresh from UK roasters</Headline>
      <View style={s.actions}>
        <Link href="/scan" asChild>
          <Button label="Scan a bag" icon="photo-camera" style={{ flex: 1 }} />
        </Link>
        <Link href="/shelf" asChild>
          <Button label="My shelf" variant="secondary" />
        </Link>
      </View>
      {!beans.isPending && <Headline size="section">In stock now</Headline>}
    </View>
  );

  return (
    <FlatList
      data={beans.data?.items ?? []}
      keyExtractor={(b) => b.id}
      ListHeaderComponent={header}
      ListEmptyComponent={beans.isPending ? <ActivityIndicator style={{ marginTop: 32 }} /> : null}
      contentContainerStyle={s.list}
      renderItem={({ item }) => (
        <Link href={{ pathname: "/bean/[roaster]/[bean]", params: { roaster: item.roaster.slug, bean: item.slug } }} asChild>
          <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
            <Frame uri={item.imageUrl} style={s.thumb} />
            <View style={s.rowBody}>
              {item.roastLevel && <Chip small label={`${humanize(item.roastLevel)} roast`} />}
              <Headline>{item.name}</Headline>
              <Body italic muted>
                {item.roaster.name}
                {item.originCountry ? ` · ${item.originCountry}` : ""}
              </Body>
              {item.avgRating !== null && <Rating value={item.avgRating} count={item.reviewCount} />}
            </View>
          </Pressable>
        </Link>
      )}
    />
  );
}

const useStyles = themed(() =>
  StyleSheet.create({
    list: { paddingHorizontal: GUTTER, paddingBottom: 64, gap: 40 },
    header: { gap: 16, paddingTop: 16 },
    actions: { flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 32 },
    row: { flexDirection: "row", gap: 24, alignItems: "center" },
    thumb: { width: "33%" },
    rowBody: { flex: 1, gap: 6, alignItems: "flex-start" },
  }),
);
