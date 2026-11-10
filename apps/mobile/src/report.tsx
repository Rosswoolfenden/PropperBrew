import { useMutation, useQuery } from "@tanstack/react-query";
import { radius, REPORT_REASON_LABELS, REPORT_REASONS, type ReportTarget } from "@propperbrew/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "./session";
import { fonts, themed, useColors } from "./theme";
import { useTRPC } from "./trpc";
import { Button, Field, GUTTER, Headline } from "./ui";

type Reason = (typeof REPORT_REASONS)[number];

/** "Report" on a review, recipe or profile: a sheet with the reasons. Not shown on your own posts. */
export function ReportButton({
  targetType,
  targetId,
  what,
  ownerUsername,
}: {
  targetType: ReportTarget;
  targetId: string;
  /** "alice's review", for the button's label. */
  what: string;
  ownerUsername?: string | null;
}) {
  const styles = useStyles();
  const colors = useColors();
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const me = useQuery({ ...trpc.me.get.queryOptions(), enabled: !!session });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const report = useMutation(trpc.reports.create.mutationOptions());

  if (ownerUsername && me.data?.username === ownerUsername) return null;
  if (report.isSuccess) {
    return (
      <Text role="status" style={styles.done}>
        Thanks for telling us. We&apos;ll take a look.
      </Text>
    );
  }

  const close = () => (setOpen(false), report.reset(), setMissing(false));
  const send = () => (reason ? report.mutate({ targetType, targetId, reason, note }) : setMissing(true));

  return (
    <>
      <Pressable
        role="button"
        aria-label={`Report ${what}`}
        hitSlop={8}
        disabled={!ready}
        onPress={() => (session ? setOpen(true) : router.push("/sign-in"))}
        style={{ alignSelf: "flex-start" }}
      >
        <Text style={styles.link}>Report</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.backdrop}>
          <ScrollView style={styles.sheet} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
            <View role="dialog" aria-label={`Report ${what}`} style={{ gap: 16 }}>
              <Headline>What&apos;s wrong?</Headline>
              <View role="radiogroup" aria-label="What's wrong?" style={{ gap: 6 }}>
                {REPORT_REASONS.map((r) => (
                  <Pressable
                    key={r}
                    role="radio"
                    aria-checked={reason === r}
                    onPress={() => (setReason(r), setMissing(false))}
                    style={[styles.reason, reason === r && styles.reasonOn]}
                  >
                    <Text style={[styles.reasonText, reason === r && styles.reasonTextOn]}>{REPORT_REASON_LABELS[r]}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Anything else? (optional)" multiline value={note} onChangeText={setNote} maxLength={1000} />
              {(missing || report.error) && (
                <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
                  {missing ? "Choose what's wrong." : report.error!.message}
                </Text>
              )}
              <Button label={report.isPending ? "Sending…" : "Send report"} disabled={report.isPending} onPress={send} />
              <Button label="Cancel" variant="text" onPress={close} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    link: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: c.onSurfaceVariant },
    done: { fontFamily: fonts.bodyItalic, fontSize: 15, color: c.onSurfaceVariant },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
    sheet: { flexGrow: 0, maxHeight: "85%", padding: GUTTER, paddingBottom: 40, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: c.surface },
    reason: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: c.surfaceContainerLow },
    reasonOn: { backgroundColor: c.surfaceTint },
    reasonText: { fontFamily: fonts.body, fontSize: 17, color: c.onSurface },
    reasonTextOn: { color: c.onPrimary },
  }),
);
