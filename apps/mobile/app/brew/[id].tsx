import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { BrewForm } from "@/brew-form";
import { useTRPC } from "@/trpc";
import { Body, Button, GUTTER, Headline, Loading } from "@/ui";

const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One brew from the journal: change it, delete it, or brew it again. */
export default function BrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const brew = useQuery({ ...trpc.brews.get.queryOptions({ id }), retry: (n, err) => err.data?.code !== "NOT_FOUND" && n < 2 });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: trpc.brews.pathKey() }), queryClient.invalidateQueries({ queryKey: trpc.shelf.pathKey() })]);
  const update = useMutation(trpc.brews.update.mutationOptions({ onSuccess: async () => (await refresh(), router.back()) }));
  const remove = useMutation(trpc.brews.delete.mutationOptions({ onSuccess: async () => (await refresh(), router.back()) }));

  if (brew.isPending) return <Loading />;
  if (brew.error) return <Body muted style={{ padding: GUTTER }}>This brew isn&apos;t in your journal.</Body>;
  const b = brew.data;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Headline size="display">Your brew</Headline>
      <Body italic muted>
        {when.format(b.brewedAt)}
      </Body>
      <Link href={{ pathname: "/brew/new", params: { beanId: b.coffeeBeanId, again: b.id, ...(b.shelfEntryId && { shelfEntryId: b.shelfEntryId }) } }} asChild>
        <Button label="Brew again" icon="replay" variant="secondary" />
      </Link>
      <BrewForm
        start={b}
        links={{ coffeeBeanId: b.coffeeBeanId, shelfEntryId: b.shelfEntryId, recipeId: b.recipeId }}
        submitLabel="Save changes"
        busy={update.isPending}
        serverError={update.error?.message}
        onSubmit={(input) => update.mutate({ ...input, id: b.id })}
      />
      <View style={{ marginTop: 8 }}>
        <Button label={remove.isPending ? "Deleting…" : "Delete this brew"} variant="text" disabled={remove.isPending} onPress={() => remove.mutate({ id: b.id })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { padding: GUTTER, paddingBottom: 64, gap: 16 } });
