import { authMessage, MIN_PASSWORD } from "@propperbrew/shared";
import { Link, router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession, webUrl } from "@/session";
import { supabase } from "@/supabase";
import { fonts, themed } from "@/theme";
import { Body, Button, Eyebrow, Field, GUTTER } from "@/ui";

type Message = { tone: "error" | "info"; text: string; resend?: boolean };

/** Email + password: sign in, or create an account (confirmed by email). Apple/Google sign-in slot in here later. */
export default function SignInScreen() {
  const { expired } = useSession();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const styles = useStyles();
  const signUp = mode === "signUp";
  // Confirmation links open the website, which confirms the account and says to come back here.
  const confirmUrl = `${webUrl}/welcome`;

  const submit = async () => {
    setMessage(null);
    if (signUp && password.length < MIN_PASSWORD) {
      return setMessage({ tone: "error", text: `Use at least ${MIN_PASSWORD} characters for your password.` });
    }
    setBusy(true);
    const result = signUp
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: confirmUrl } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (result.error) return setMessage({ tone: "error", text: authMessage(result.error), resend: result.error.code === "email_not_confirmed" });
    if (!result.data.session) {
      return setMessage({ tone: "info", text: `Check your email. We've sent a link to ${email.trim()} to confirm your account, then sign in here.`, resend: true });
    }
    // Back to wherever they were (the basket, a coffee…), or home if they came straight here.
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const resend = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: confirmUrl } });
    setBusy(false);
    setMessage(error ? { tone: "error", text: authMessage(error) } : { tone: "info", text: `Sent again. Check ${email.trim()} for the link.` });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Eyebrow style={{ letterSpacing: 3 }}>{signUp ? "Join the club" : "Welcome back"}</Eyebrow>
          <Text role="heading" style={styles.title}>
            The Ritual Awaits
          </Text>
          <Body italic muted style={styles.lede}>
            {signUp ? "Create an account to keep your shelf, reviews and recipes." : "Enter your details to reconnect with your daily brew."}
          </Body>
        </View>
        {expired && !message && (
          <View role="status" style={styles.notice}>
            <Text style={styles.noticeText}>You&apos;ve been signed out. Sign in again to carry on.</Text>
          </View>
        )}
        <View style={styles.form}>
          <Field
            label="Email address"
            placeholder="your@email.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={(t) => (setEmail(t), setMessage(null))}
          />
          <Field
            label="Password"
            placeholder="••••••••"
            autoComplete={signUp ? "new-password" : "current-password"}
            secureTextEntry
            value={password}
            onChangeText={(t) => (setPassword(t), setMessage(null))}
          />
          {!signUp && (
            <Link href={{ pathname: "/forgot-password", params: email.trim() ? { email: email.trim() } : {} }} asChild>
              <Button label="Forgot your password?" variant="text" style={{ alignSelf: "flex-end", marginTop: -12 }} />
            </Link>
          )}
          {message && (
            <View role={message.tone === "error" ? "alert" : "status"} style={[styles.notice, message.tone === "error" && styles.error]}>
              <Text style={[styles.noticeText, message.tone === "error" && styles.errorText]}>{message.text}</Text>
              {message.resend && <Button label="Resend the email" variant="text" disabled={busy} onPress={resend} style={{ alignSelf: "flex-start" }} />}
            </View>
          )}
          <Button label={busy ? "One moment…" : signUp ? "Create account" : "Sign in"} disabled={busy} onPress={submit} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.footer}>
          <Body italic muted>
            {signUp ? "Already have an account?" : "New to the club?"}
          </Body>
          <Button
            label={signUp ? "Sign in" : "Create account"}
            variant="text"
            disabled={busy}
            onPress={() => (setMode(signUp ? "signIn" : "signUp"), setMessage(null))}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { flexGrow: 1, justifyContent: "center", padding: GUTTER, gap: 40 },
    intro: { gap: 12, alignItems: "center" },
    title: { fontFamily: fonts.headline, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: c.primary, textAlign: "center" },
    lede: { fontSize: 20, lineHeight: 28, textAlign: "center" },
    form: { gap: 24 },
    notice: { gap: 4, padding: 14, borderRadius: 8, backgroundColor: c.secondaryContainer },
    noticeText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: c.onSecondaryContainer },
    error: { backgroundColor: `${c.error}14` },
    errorText: { color: c.error },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  }),
);
