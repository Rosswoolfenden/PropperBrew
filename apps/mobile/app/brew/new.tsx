import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { BrewForm, type BrewStart } from "@/brew-form";
import { useTRPC } from "@/trpc";
import { Body, GUTTER, Headline, Loading } from "@/ui";

/**
 * Log a brew of a coffee. Starts from (in order): a brew they want to repeat ("Brew again"), the
 * recipe they've just followed, or their last brew of this coffee. A finished timer passes its time.
 */
export default function NewBrewScreen() {
  const p = useLocalSearchParams<{ beanId: string; beanName?: string; shelfEntryId?: string; recipeId?: string; again?: string; time?: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const again = useQuery({ ...trpc.brews.get.queryOptions({ id: p.again! }), enabled: !!p.again });
  const fallback = useQuery({
    ...trpc.brews.startingPoint.queryOptions({ coffeeBeanId: p.beanId, recipeId: p.recipeId || undefined }),
    enabled: !p.again,
  });
  const save = useMutation(
    trpc.brews.create.mutationOptions({
      onSuccess: async () => {
        await Promise.all([queryClient.invalidateQueries({ queryKey: trpc.brews.pathKey() }), queryClient.invalidateQueries({ queryKey: trpc.shelf.pathKey() })]);
        router.dismissTo("/journal");
      },
    }),
  );

  const source = p.again ? again : fallback;
  if (source.isPending) return <Loading />;
  const base: BrewStart | null = source.data ? { ...source.data, rating: null, notes: null } : null;
  const timed = Number(p.time);
  const start = base && timed > 0 ? { ...base, totalBrewTimeSeconds: timed } : base;
  const from = p.again ? "Starting from that brew." : fallback.data?.from === "recipe" ? "Starting from the recipe." : fallback.data?.from === "last" ? "Starting from your last brew of this coffee." : null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Headline size="display">Log a brew</Headline>
      {p.beanName && (
        <Body italic muted style={{ fontSize: 20 }}>
          {p.beanName}
        </Body>
      )}
      {from && <Body muted>{from} Change what you did differently.</Body>}
      <BrewForm
        start={start ?? (timed > 0 ? { brewMethod: "v60", coffeeDoseG: 15, waterWeightG: 250, waterTempC: null, grinderModel: null, grindSetting: null, totalBrewTimeSeconds: timed } : null)}
        links={{ coffeeBeanId: p.beanId, shelfEntryId: p.shelfEntryId || null, recipeId: p.recipeId || (again.data?.recipeId ?? null) }}
        submitLabel="Save brew"
        busy={save.isPending}
        serverError={save.error?.message}
        onSubmit={(input) => save.mutate(input)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { padding: GUTTER, paddingBottom: 64, gap: 16 } });
