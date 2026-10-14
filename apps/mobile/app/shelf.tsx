import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useTRPC } from "@/trpc";

const REST_LABEL = { resting: "Resting", peak: "At its peak", past_peak: "Past peak" } as const;

export default function ShelfScreen() {
  const trpc = useTRPC();
  const shelf = useQuery(trpc.shelf.list.queryOptions());

  if (shelf.isPending) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (shelf.error) {
    return (
      <Link href="/sign-in" style={{ padding: 16 }}>
        <Text>Sign in to see your shelf →</Text>
      </Link>
    );
  }

  return (
    <FlatList
      data={shelf.data}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      ListEmptyComponent={<Text style={styles.muted}>Scan a bag or add a coffee to start your shelf.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={{ fontWeight: "600" }}>{item.bean.name}</Text>
          {item.rest ? (
            <Text>
              {REST_LABEL[item.rest.state]} · day {item.rest.daysSinceRoast} post-roast
            </Text>
          ) : (
            <Text style={styles.muted}>Add a roast date to track resting</Text>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#e8dfd4", gap: 4 },
  muted: { color: "#7a6a5e" },
});
