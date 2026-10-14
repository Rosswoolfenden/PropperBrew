import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Button, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { brewRatio, formatGbp, type BrewMethod } from "@propperbrew/shared";
import { useTRPC } from "@/trpc";

const METHOD_FILTERS: { label: string; value?: BrewMethod }[] = [
  { label: "All" },
  { label: "V60", value: "v60" },
  { label: "Espresso", value: "espresso" },
  { label: "AeroPress", value: "aeropress" },
];

export default function BeanScreen() {
  const { roaster, bean: beanSlug } = useLocalSearchParams<{ roaster: string; bean: string }>();
  const trpc = useTRPC();
  const [method, setMethod] = useState<BrewMethod | undefined>();

  const bean = useQuery(trpc.beans.bySlug.queryOptions({ roasterSlug: roaster, beanSlug }));
  const recipes = useQuery({
    ...trpc.recipes.forBean.queryOptions({ coffeeBeanId: bean.data?.id ?? "", brewMethod: method, limit: 10 }),
    enabled: !!bean.data,
  });
  const addToShelf = useMutation(
    trpc.shelf.add.mutationOptions({ onSuccess: () => Alert.alert("Added to your shelf") }),
  );

  if (bean.isPending) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (!bean.data) return <Text style={{ padding: 16 }}>Coffee not found.</Text>;
  const b = bean.data;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: b.name }} />
      {b.imageUrl && <Image source={{ uri: b.imageUrl }} style={styles.hero} />}
      <Text style={styles.muted}>{b.roaster.name}</Text>
      <Text style={styles.h1}>{b.name}</Text>
      {b.avgRating !== null && (
        <Text>
          ★ {b.avgRating.toFixed(1)} · {b.reviewCount} reviews
        </Text>
      )}
      {b.tastingNotes.length > 0 && <Text>{b.tastingNotes.join(" · ")}</Text>}
      <Text style={styles.muted}>
        {[b.originCountry, b.process, b.varietals.join(", "), b.altitudeMasl && `${b.altitudeMasl} masl`]
          .filter(Boolean)
          .join(" · ")}
      </Text>

      <Button
        title="Add to my shelf"
        onPress={() => addToShelf.mutate({ coffeeBeanId: b.id })}
      />

      <Text style={styles.h2}>Buy</Text>
      {b.variants.length === 0 ? (
        <Text style={styles.muted}>Sold out — reviews and recipes stay here for reference.</Text>
      ) : (
        b.variants.map((v) => (
          <Text key={v.id}>
            {v.title} — {formatGbp(v.pricePence)}
          </Text>
        ))
      )}

      <Text style={styles.h2}>How people brew it</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {METHOD_FILTERS.map((f) => (
          <Pressable
            key={f.label}
            onPress={() => setMethod(f.value)}
            style={[styles.chip, method === f.value && styles.chipActive]}
          >
            <Text>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      {recipes.data?.length === 0 && <Text style={styles.muted}>No recipes yet.</Text>}
      {recipes.data?.map((r) => (
        <View key={r.id} style={styles.recipe}>
          <Text style={{ fontWeight: "600" }}>
            {r.coffeeDoseG}g → {r.waterWeightG}g ({brewRatio(r.coffeeDoseG, r.waterWeightG)})
            {r.waterTempC ? ` · ${r.waterTempC}°C` : ""}
          </Text>
          {r.grinderModel && (
            <Text>
              {r.grinderModel}
              {r.grindSetting ? ` @ ${r.grindSetting}` : ""}
            </Text>
          )}
          <Text style={styles.muted}>
            ▲ {r.upvotesCount} · {r.user.username}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", aspectRatio: 1, borderRadius: 12 },
  h1: { fontSize: 24, fontWeight: "700" },
  h2: { fontSize: 18, fontWeight: "600", marginTop: 12 },
  muted: { color: "#7a6a5e" },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "#e8dfd4" },
  chipActive: { backgroundColor: "#f3e3d6", borderColor: "#b3541e" },
  recipe: { paddingVertical: 8, borderTopWidth: 1, borderColor: "#e8dfd4" },
});
