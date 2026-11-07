import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  formatPriceFrom,
  humanize,
  notesSentence,
  SEARCH_MAX_PRICES,
  SEARCH_SORT_LABELS,
  SEARCH_SORTS,
  type BeanSearchInput,
} from "@propperbrew/shared";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC, useTRPCClient } from "@/trpc";
import { Body, Button, Chip, Eyebrow, FilterChip, Frame, GUTTER, Headline, Loading, Rating } from "@/ui";

const PAGE_SIZE = 24;
type Filters = Omit<BeanSearchInput, "query" | "limit" | "offset">;

/** The typed text, once it has stopped changing for a moment, so we don't search on every keystroke. */
function useSettled<T>(value: T, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

export default function SearchScreen() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const styles = useStyles();
  const colors = useColors();
  const [text, setText] = useState("");
  const query = useSettled(text.trim());
  const [filters, setFilters] = useState<Filters>({});
  const options = useQuery(trpc.beans.searchOptions.queryOptions());
  const input = { ...filters, query: query || undefined, limit: PAGE_SIZE };
  const search = useInfiniteQuery({
    queryKey: trpc.beans.search.queryKey(input),
    queryFn: ({ pageParam }) => client.beans.search.query({ ...input, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.hasMore ? all.length * PAGE_SIZE : undefined),
    placeholderData: keepPreviousData,
  });
  const results = search.data && { total: search.data.pages[0]!.total, items: search.data.pages.flatMap((p) => p.items) };

  // Picking the active chip again clears that filter.
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? undefined : value }));
  };
  const filtered = !!query || Object.entries(filters).some(([k, v]) => v !== undefined && k !== "sort");

  const row = (label: string, chips: { label: string; selected: boolean; onPress: () => void }[]) =>
    chips.length > 0 && (
      <View role="group" aria-label={label} style={{ gap: 8 }}>
        <Eyebrow style={{ paddingHorizontal: GUTTER }}>{label}</Eyebrow>
        {/* Nested scroll views don't inherit this: without it, the first tap only closes the keyboard. */}
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {chips.map((c) => (
            <FilterChip key={c.label} {...c} />
          ))}
        </ScrollView>
      </View>
    );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: GUTTER, gap: 16 }}>
        <Headline>Find your next coffee</Headline>
        <TextInput
          role="searchbox"
          aria-label="Search coffees"
          placeholder="Coffee, origin, roaster or tasting note"
          placeholderTextColor={colors.outline}
          value={text}
          onChangeText={setText}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
      </View>

      <View style={{ gap: 16 }}>
        {row(
          "Sort",
          SEARCH_SORTS.filter((s) => s !== "newest").map((s) => ({
            label: SEARCH_SORT_LABELS[s],
            selected: filters.sort === s,
            onPress: () => toggle("sort", s),
          })),
        )}
        {options.data && (
          <>
            {row("Origin", options.data.origins.map((o) => ({ label: o, selected: filters.originCountry === o, onPress: () => toggle("originCountry", o) })))}
            {row("Process", options.data.processes.map((p) => ({ label: humanize(p), selected: filters.process === p, onPress: () => toggle("process", p) })))}
            {row("Roast", options.data.roastLevels.map((r) => ({ label: humanize(r), selected: filters.roastLevel === r, onPress: () => toggle("roastLevel", r) })))}
          </>
        )}
        {row("Price", SEARCH_MAX_PRICES.map((p) => ({ label: `Under £${p / 100}`, selected: filters.maxPricePence === p, onPress: () => toggle("maxPricePence", p) })))}
        {row("More", [
          ...(options.data?.hasDecaf || filters.decaf
            ? [{ label: "Decaf", selected: filters.decaf === true, onPress: () => toggle("decaf", true) }]
            : []),
          { label: "Include sold out", selected: filters.inStockOnly === false, onPress: () => toggle("inStockOnly", false) },
        ])}
      </View>

      <View style={{ paddingHorizontal: GUTTER, gap: 24 }}>
        {!results ? (
          search.error ? (
            <View style={{ gap: 16 }}>
              <Body muted>We couldn&apos;t search just now.</Body>
              <Button label="Try again" variant="secondary" onPress={() => search.refetch()} />
            </View>
          ) : (
            <Loading />
          )
        ) : (
          <>
            <View style={styles.resultsHead}>
              <Text role="status" style={styles.count}>
                {results.total} {results.total === 1 ? "coffee" : "coffees"}
              </Text>
              {filtered && (
                <Button
                  label="Clear search"
                  variant="text"
                  onPress={() => (setText(""), setFilters({}))}
                />
              )}
            </View>
            {results.items.length === 0 ? (
              <Body muted>No coffees match. Try fewer filters or different words.</Body>
            ) : (
              <View role="list" aria-label="Results" style={{ gap: 32 }}>
                {results.items.map((c) => (
                  <Link key={c.id} href={{ pathname: "/bean/[roaster]/[bean]", params: { roaster: c.roaster.slug, bean: c.slug } }} asChild>
                    <Pressable role="listitem" style={styles.result}>
                      <Frame uri={c.imageUrl} fit="contain" style={styles.resultImage} />
                      <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
                        {c.roastLevel && <Chip small label={`${humanize(c.roastLevel)} roast`} />}
                        <Text style={styles.resultName}>{c.name}</Text>
                        <Body muted style={{ fontSize: 14, lineHeight: 19 }}>
                          {[c.roaster.name, c.originCountry, c.tastingNotes.length > 0 && notesSentence(c.tastingNotes)].filter(Boolean).join(" · ")}
                        </Body>
                        {c.avgRating !== null && <Rating value={c.avgRating} count={c.reviewCount} />}
                        <Text style={styles.resultPrice}>
                          {c.fromPricePence !== null ? formatPriceFrom(c.fromPricePence, c.priceCount) : "Sold out"}
                        </Text>
                      </View>
                    </Pressable>
                  </Link>
                ))}
              </View>
            )}
            {search.hasNextPage && (
              <Button label="Show more" variant="secondary" disabled={search.isFetchingNextPage} onPress={() => search.fetchNextPage()} />
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { paddingTop: 16, paddingBottom: 64, gap: 32 },
    input: {
      fontFamily: fonts.body,
      fontSize: 17,
      color: c.onSurface,
      backgroundColor: c.surfaceContainerHighest,
      borderRadius: 6,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    chipRow: { paddingHorizontal: GUTTER, gap: 8 },
    resultsHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 40 },
    count: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: c.onSurfaceVariant },
    result: { flexDirection: "row", alignItems: "center", gap: 20 },
    resultImage: { width: 112, aspectRatio: 1 },
    resultName: { fontFamily: fonts.title, fontSize: 20, lineHeight: 24, color: c.primary },
    resultPrice: { fontFamily: fonts.title, fontSize: 18, color: c.onSurface, marginTop: 6 },
  }),
);
