import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BREW_METHOD_LABELS, BREW_METHODS, UserProfileInput, type BrewMethod } from "@propperbrew/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ProfileScreen } from "@/profile";
import { useSession } from "@/session";
import { useTRPC, type RouterOutputs } from "@/trpc";
import { fonts, useColors } from "@/theme";
import { Body, Button, Eyebrow, Field, FilterChip, GUTTER, Loading } from "@/ui";

const MESSAGES: Record<string, string> = {
  displayName: "Keep your name under 60 characters",
  bio: "Keep this under 160 characters",
  defaultGrinder: "Keep the grinder under 80 characters",
};

/** Your own profile, with Edit profile. */
export default function MyProfileScreen() {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const me = useQuery({ ...trpc.me.get.queryOptions(), enabled: !!session });
  const [editing, setEditing] = useState(false);

  if (!ready || (session && me.isPending)) return <Loading />;
  if (!session || !me.data) {
    return (
      <View style={styles.signedOut}>
        <Body italic muted>
          Your profile gathers your reviews and recipes in one place.
        </Body>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to see your profile" />
        </Link>
      </View>
    );
  }
  return (
    <ProfileScreen username={me.data.username}>
      {editing ? (
        <EditProfile profile={me.data} onDone={() => setEditing(false)} />
      ) : (
        <View style={{ gap: 12 }}>
          <Button label="Edit profile" icon="edit" variant="secondary" onPress={() => setEditing(true)} />
          <Link href="/orders" asChild>
            <Button label="Your orders" icon="receipt-long" variant="secondary" />
          </Link>
        </View>
      )}
    </ProfileScreen>
  );
}

function EditProfile({ profile, onDone }: { profile: NonNullable<RouterOutputs["me"]["get"]>; onDone: () => void }) {
  const trpc = useTRPC();
  const colors = useColors();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    displayName: profile.displayName ?? "",
    bio: profile.bio ?? "",
    defaultGrinder: profile.defaultGrinder ?? "",
  });
  const [method, setMethod] = useState<BrewMethod | null>(profile.defaultBrewMethod);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation(
    trpc.me.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.me.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.users.pathKey() }),
        ]);
        onDone();
      },
    }),
  );

  const submit = () => {
    const result = UserProfileInput.safeParse({ ...form, defaultBrewMethod: method });
    if (!result.success) {
      const found: Record<string, string> = {};
      for (const issue of result.error.issues) found[String(issue.path[0])] ??= MESSAGES[String(issue.path[0])] ?? issue.message;
      return setErrors(found);
    }
    setErrors({});
    save.mutate(result.data);
  };
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <View role="form" aria-label="Edit profile" style={styles.form}>
      <Field label="Name" value={form.displayName} onChangeText={set("displayName")} placeholder="How you'd like to be shown" error={errors.displayName} />
      <Field label="About you" value={form.bio} onChangeText={set("bio")} placeholder="In search of the perfect Ethiopian heirloom." error={errors.bio} />
      <Field label="Grinder" value={form.defaultGrinder} onChangeText={set("defaultGrinder")} placeholder="Comandante C40" error={errors.defaultGrinder} />
      <View role="group" aria-label="Usual brew method" style={{ gap: 8 }}>
        <Eyebrow style={{ marginLeft: 4 }}>Usual brew method</Eyebrow>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {BREW_METHODS.map((m) => (
            <FilterChip key={m} label={BREW_METHOD_LABELS[m]} selected={method === m} onPress={() => setMethod(method === m ? null : m)} />
          ))}
        </ScrollView>
      </View>
      {save.error && (
        <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
          {save.error.message}
        </Text>
      )}
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onDone} style={{ flex: 1 }} />
        <Button label={save.isPending ? "Saving…" : "Save profile"} disabled={save.isPending} onPress={submit} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  signedOut: { padding: GUTTER, gap: 24 },
  form: { gap: 20 },
  actions: { flexDirection: "row", gap: 12 },
});
