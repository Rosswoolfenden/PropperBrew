import { useMutation } from "@tanstack/react-query";
import { authMessage, DELETE_ACCOUNT_PHRASE, MIN_PASSWORD } from "@propperbrew/shared";
import { Link, router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { signOut, useSession, webUrl } from "@/session";
import { supabase } from "@/supabase";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Field, GUTTER, Headline, Loading } from "@/ui";

type Note = { tone: "error" | "info"; text: string } | null;

/** Change email or password, sign out, or delete the account (which the app stores require). */
export default function AccountScreen() {
  const { session, ready } = useSession();
  const styles = useStyles();
  if (!ready) return <Loading />;
  if (!session) {
    return (
      <View style={styles.message}>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to manage your account" />
        </Link>
      </View>
    );
  }
  const email = session.user.email ?? "";
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ChangeEmail email={email} />
      <ChangePassword email={email} />
      <Section title="Sign out">
        <Body muted>Signed in as {email}.</Body>
        <Button label="Sign out" variant="secondary" onPress={async () => (await signOut(), router.dismissTo("/"))} />
      </Section>
      <DeleteAccount />
    </ScrollView>
  );
}

function Section({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  const styles = useStyles();
  return (
    <View role="region" aria-label={title} style={[styles.section, danger && styles.danger]}>
      <Headline>{title}</Headline>
      {children}
    </View>
  );
}

function NoteText({ note }: { note: Note }) {
  const styles = useStyles();
  if (!note) return null;
  return (
    <Text role={note.tone === "error" ? "alert" : "status"} style={note.tone === "error" ? styles.error : styles.info}>
      {note.text}
    </Text>
  );
}

function ChangeEmail({ email }: { email: string }) {
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const submit = async () => {
    const wanted = next.trim();
    if (!/^\S+@\S+\.\S+$/.test(wanted)) return setNote({ tone: "error", text: "Enter a valid email address." });
    if (wanted.toLowerCase() === email.toLowerCase()) return setNote({ tone: "error", text: "That's already your email address." });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: wanted }, { emailRedirectTo: `${webUrl}/account?email=changed` });
    setBusy(false);
    if (error) return setNote({ tone: "error", text: authMessage(error) });
    setNote({ tone: "info", text: `Check ${wanted} for a link to confirm it. Until then, you sign in with ${email}.` });
    setNext("");
  };
  return (
    <Section title="Email address">
      <Body muted>You sign in with {email}.</Body>
      <Field
        label="New email address"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={next}
        onChangeText={(t) => (setNext(t), setNote(null))}
      />
      <NoteText note={note} />
      <Button label={busy ? "Sending…" : "Change email"} variant="secondary" disabled={busy} onPress={submit} />
    </Section>
  );
}

function ChangePassword({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const submit = async () => {
    if (password.length < MIN_PASSWORD) return setNote({ tone: "error", text: `Use at least ${MIN_PASSWORD} characters for your new password.` });
    setBusy(true);
    // Check it's really them before changing it.
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      return setNote({ tone: "error", text: check.error.code === "invalid_credentials" ? "That's not your current password." : authMessage(check.error) });
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setNote({ tone: "error", text: authMessage(error) });
    setNote({ tone: "info", text: "Your password has been changed." });
    setCurrent("");
    setPassword("");
  };
  return (
    <Section title="Password">
      <Field label="Current password" secureTextEntry autoComplete="current-password" value={current} onChangeText={(t) => (setCurrent(t), setNote(null))} />
      <Field label="New password" secureTextEntry autoComplete="new-password" value={password} onChangeText={(t) => (setPassword(t), setNote(null))} />
      <NoteText note={note} />
      <Button label={busy ? "Saving…" : "Change password"} variant="secondary" disabled={busy} onPress={submit} />
    </Section>
  );
}

function DeleteAccount() {
  const trpc = useTRPC();
  const colors = useColors();
  const [confirm, setConfirm] = useState("");
  const remove = useMutation(
    trpc.me.deleteAccount.mutationOptions({
      onSuccess: async () => {
        await signOut();
        router.dismissTo("/");
      },
    }),
  );
  const ready = confirm.trim().toLowerCase() === DELETE_ACCOUNT_PHRASE;
  return (
    <Section title="Delete your account" danger>
      <Body muted>
        This deletes your profile, reviews, recipes, votes, shelf and basket, and can&apos;t be undone. Orders you&apos;ve placed are kept for the
        roasters&apos; records, without your account.
      </Body>
      <Field
        label={`Type “${DELETE_ACCOUNT_PHRASE}” to confirm`}
        autoCapitalize="none"
        autoCorrect={false}
        value={confirm}
        onChangeText={(t) => (setConfirm(t), remove.reset())}
      />
      {remove.error && (
        <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
          {remove.error.message}
        </Text>
      )}
      <Button
        label={remove.isPending ? "Deleting…" : "Delete my account"}
        disabled={!ready || remove.isPending}
        onPress={() => remove.mutate({ confirm })}
        style={{ backgroundColor: colors.error }}
      />
    </Section>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 24 },
    message: { padding: GUTTER },
    section: { gap: 16, padding: 20, borderRadius: 12, backgroundColor: c.surfaceContainerLow },
    danger: { backgroundColor: `${c.error}0F` },
    info: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: c.onSurfaceVariant },
    error: { fontFamily: fonts.label, fontSize: 14, color: c.error },
  }),
);
