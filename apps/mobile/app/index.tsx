import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { NewArrivals, RoasterCollection, RoasterRow, RoasterSpotlight } from "@/discover";
import { useTRPC } from "@/trpc";
import { Body, Button, GUTTER, HeaderIcon, Loading } from "@/ui";

/** How many roasters the spotlight cycles through. */
const SPOTLIGHT_COUNT = 4;

export default function DiscoverScreen() {
  const trpc = useTRPC();
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
          <RoasterCollection roasters={roasters.data} onSelect={jumpTo} />
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

const styles = StyleSheet.create({
  container: { paddingTop: 16, paddingBottom: 64, gap: 72 },
  message: { paddingHorizontal: GUTTER, gap: 16 },
});
