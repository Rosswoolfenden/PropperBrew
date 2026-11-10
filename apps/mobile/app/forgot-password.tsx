import { authMessage } from "@propperbrew/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { webUrl } from "@/session";
import { supabase } from "@/supabase";
import { fonts, themed } from "@/theme";
import { Body, Button, Field, GUTTER, Headline } from "@/ui";

/** Ask for a reset link. The new password is chosen on the website, then they sign in here with it. */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const styles = useStyles();

  const send = async () => {
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError("Enter the email address you signed up with.");
    setBusy(true);
    setError(null);
    const result = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${webUrl}/reset-password` });
    setBusy(false);
    if (result.error) return setError(authMessage(result.error));
    setSent(address);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 8 }}>
        <Headline size="display">Reset your password</Headline>
        <Body italic muted>
          We&apos;ll email you a link to choose a new one.
        </Body>
      </View>
      <Field
        label="Email address"
        placeholder="your@email.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={(t) => (setEmail(t), setSent(null))}
        error={error ?? undefined}
      />
      {sent && (
        <View role="status" style={styles.notice}>
          <Text style={styles.noticeText}>
            If there&apos;s an account for {sent}, we&apos;ve sent it a link. Choose your new password there, then sign in here with it.
          </Text>
        </View>
      )}
      <Button label={busy ? "Sending…" : sent ? "Send again" : "Send reset link"} disabled={busy} onPress={send} />
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingTop: 32, gap: 28 },
    notice: { padding: 14, borderRadius: 8, backgroundColor: c.secondaryContainer },
    noticeText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: c.onSecondaryContainer },
  }),
);
