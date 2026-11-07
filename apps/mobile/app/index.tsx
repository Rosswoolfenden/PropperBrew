import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useRef } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NewArrivals, RoasterCollection, RoasterRow, RoasterSpotlight } from "@/discover";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, GUTTER, HeaderIcon, Loading } from "@/ui";

/** How many roasters the spotlight cycles through. */
const SPOTLIGHT_COUNT = 4;

export default function DiscoverScreen() {
  const trpc = useTRPC();
  const styles = useStyles();
  const colors = useColors();
  const roasters = useQuery(trpc.roasters.discover.queryOptions({}));
  const scroll = useRef<ScrollView>(null);
  const rowOffsets = useRef(new Map<string, number>());

  const jumpTo = (roasterId: string) => {
    const y = rowOffsets.current.get(roasterId);
    if (y !== undefined) scroll.current?.scrollTo({ y: y - 16, animated: true });
  };

  return (
    <ScrollView ref={scroll} contentContainerStyle={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderIcon icon="photo-camera" label="Scan a bag" onPress={() => router.push("/scan")} />,
          headerRight: () => <HeaderIcon icon="inventory-2" label="My shelf" onPress={() => router.push("/shelf")} />,
        }}
      />
      <Pressable
        role="button"
        aria-label="Search coffees"
        onPress={() => router.push("/search")}
        style={({ pressed }) => [styles.search, pressed && { opacity: 0.8 }]}
      >
        <MaterialIcons name="search" size={20} color={colors.outline} />
        <Text style={styles.searchText}>Search coffee, origin or tasting note</Text>
      </Pressable>
      {roasters.isPending ? (
        <Loading />
      ) : roasters.error ? (
        <View style={styles.message}>
          <Body muted>We couldn&apos;t load the roasters.</Body>
          <Button label="Try again" variant="secondary" onPress={() => roasters.refetch()} />
        </View>
      ) : roasters.data.length === 0 ? (
        <Body muted style={styles.message}>
          No coffees to order yet. Roasters appear here once they connect their shop.
        </Body>
      ) : (
        <>
          <RoasterSpotlight roasters={roasters.data.slice(0, SPOTLIGHT_COUNT)} onSelect={jumpTo} />
          <RoasterCollection roasters={roasters.data} />
          <NewArrivals roasters={roasters.data} />
          {roasters.data.map((roaster) => (
            <View key={roaster.id} onLayout={(e) => rowOffsets.current.set(roaster.id, e.nativeEvent.layout.y)}>
              <RoasterRow roaster={roaster} />
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { paddingTop: 16, paddingBottom: 64, gap: 72 },
    message: { paddingHorizontal: GUTTER, gap: 16 },
    // Sits closer to the spotlight than the sections sit to each other.
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: GUTTER,
      marginBottom: -40,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 6,
      backgroundColor: c.surfaceContainerHighest,
    },
    searchText: { fontFamily: fonts.body, fontSize: 17, color: c.outline },
  }),
);
