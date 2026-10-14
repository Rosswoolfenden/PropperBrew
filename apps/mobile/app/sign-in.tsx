import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "@/supabase";
import { fonts, themed } from "@/theme";
import { Body, Button, Eyebrow, Field, GUTTER } from "@/ui";

/** Email + password for local dev. Apple/Google sign-in slot in here later. */
export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const styles = useStyles();

  const submit = async (mode: "signIn" | "signUp") => {
    setBusy(true);
    const { error } =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) Alert.alert(error.message);
    else router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Eyebrow style={{ letterSpacing: 3 }}>Welcome back</Eyebrow>
          <Text role="heading" style={styles.title}>
            The Ritual Awaits
          </Text>
          <Body italic muted style={styles.lede}>
            Enter your details to reconnect with your daily brew.
          </Body>
        </View>
        <View style={styles.form}>
          <Field
            label="Email address"
            placeholder="your@email.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="Password"
            placeholder="••••••••"
            autoComplete="password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button label="Sign in" disabled={busy} onPress={() => submit("signIn")} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.footer}>
          <Body italic muted>
            New to the club?
          </Body>
          <Button label="Create account" variant="text" disabled={busy} onPress={() => submit("signUp")} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { flexGrow: 1, justifyContent: "center", padding: GUTTER, gap: 48 },
    intro: { gap: 12, alignItems: "center" },
    title: { fontFamily: fonts.headline, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: c.primary, textAlign: "center" },
    lede: { fontSize: 20, lineHeight: 28, textAlign: "center" },
    form: { gap: 24 },
    footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  }),
);
