import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, intervalLabel, radius } from "@propperbrew/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/session";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Eyebrow, GUTTER, Loading } from "@/ui";

const STATUS = { active: "Active", paused: "Paused", cancelled: "Cancelled", pending: "Setting up" } as const;
const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Your subscriptions: pause, resume or cancel. Checks in while a new one is being confirmed. */
export default function SubscriptionsScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const styles = useStyles();
  const colors = useColors();
  const { session, ready } = useSession();
  const [confirming, setConfirming] = useState<string | null>(null);
  const mine = useQuery({ ...trpc.subscriptions.mine.queryOptions(), enabled: !!session, refetchInterval: (q) => (q.state.data?.length ? false : 2000) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.subscriptions.pathKey() });
  const pause = useMutation(trpc.subscriptions.pause.mutationOptions({ onSuccess: refresh }));
  const resume = useMutation(trpc.subscriptions.resume.mutationOptions({ onSuccess: refresh }));
  const cancel = useMutation(trpc.subscriptions.cancel.mutationOptions({ onSuccess: async () => (await refresh(), setConfirming(null)) }));
  const busy = pause.isPending || resume.isPending || cancel.isPending;

  if (!ready || (session && mine.isPending)) return <Loading />;
  if (!session || !mine.data) {
    return (
      <View style={{ padding: GUTTER }}>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to see your subscriptions" />
        </Link>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {mine.data.length === 0 && <Body muted>No subscriptions yet. Subscribe from any coffee from a roaster that sells here.</Body>}
      {mine.data.map((s) => (
        <View key={s.id} role="region" aria-label={s.title} style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.name}>{s.bean.name}</Text>
            <Eyebrow>{STATUS[s.status]}</Eyebrow>
          </View>
          <Body muted style={{ fontSize: 15 }}>
            {s.quantity} × {s.title.split(" · ")[1]} from {s.roaster.name} · {intervalLabel(s.intervalWeeks).toLowerCase()} · {formatGbp(s.pricePence)} each time
          </Body>
          {s.status === "active" && s.nextDeliveryAt && <Body style={{ fontSize: 15 }}>Next one is paid for and sent on {date.format(s.nextDeliveryAt)}.</Body>}
          {s.status === "paused" && <Body style={{ fontSize: 15 }}>Paused: nothing is sent or charged until you resume.</Body>}
          {s.status !== "cancelled" && (
            <View style={{ gap: 8 }}>
              {s.status === "active" ? (
                <Button label="Pause" variant="secondary" disabled={busy} onPress={() => pause.mutate({ id: s.id })} />
              ) : (
                <Button label="Resume" variant="secondary" disabled={busy} onPress={() => resume.mutate({ id: s.id })} />
              )}
              {confirming === s.id ? (
                <>
                  <Button label="Yes, cancel it" disabled={busy} onPress={() => cancel.mutate({ id: s.id })} style={{ backgroundColor: colors.error }} />
                  <Button label="Keep it" variant="text" onPress={() => setConfirming(null)} />
                </>
              ) : (
                <Button label="Cancel subscription" variant="text" onPress={() => setConfirming(s.id)} />
              )}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 16 },
    card: { gap: 10, padding: 20, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    name: { flex: 1, fontFamily: fonts.title, fontSize: 18, color: c.primary },
  }),
);
