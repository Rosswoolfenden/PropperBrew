import { MaterialIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { radius } from "@propperbrew/shared";
import { Link, router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/session";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, GUTTER, Loading } from "@/ui";

const ICON = { new_coffee: "local-cafe", peak: "hourglass-bottom", order_shipped: "local-shipping" } as const;
const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** New coffees from roasters you follow, bags at their peak, orders on their way. */
export default function NotificationsScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const styles = useStyles();
  const colors = useColors();
  const { session, ready } = useSession();
  const list = useQuery({ ...trpc.notifications.list.queryOptions(), enabled: !!session });
  const markRead = useMutation(trpc.notifications.markRead.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.notifications.pathKey() }) }));

  if (!ready || (session && list.isPending)) return <Loading />;
  if (!session || !list.data) {
    return (
      <View style={styles.message}>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to see your notifications" />
        </Link>
      </View>
    );
  }
  return (
    <FlatList
      data={list.data.items}
      keyExtractor={(n) => n.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        list.data.unread > 0 ? <Button label="Mark all as read" variant="text" onPress={() => markRead.mutate({})} style={{ alignSelf: "flex-end" }} /> : null
      }
      ListEmptyComponent={<Body muted>Nothing yet. Follow a roaster to hear about their new coffees.</Body>}
      renderItem={({ item: n }) => (
        <Pressable
          role="link"
          aria-label={`${n.readAt ? "" : "Unread: "}${n.title}. ${n.body}`}
          onPress={() => {
            if (!n.readAt) markRead.mutate({ id: n.id });
            router.push(n.path as never);
          }}
          style={[styles.row, !n.readAt && styles.unread]}
        >
          <MaterialIcons name={ICON[n.kind]} size={22} color={colors.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>{n.title}</Text>
            <Body muted style={{ fontSize: 15 }}>
              {n.body}
            </Body>
            <Text style={styles.when}>{when.format(n.createdAt)}</Text>
          </View>
          {!n.readAt && <View style={styles.dot} />}
        </Pressable>
      )}
    />
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    message: { padding: GUTTER },
    list: { padding: GUTTER, gap: 8 },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: c.surfaceContainerLow },
    unread: { backgroundColor: c.surfaceContainerLowest },
    title: { fontFamily: fonts.title, fontSize: 16, color: c.primary },
    when: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: c.outline, marginTop: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: c.secondary },
  }),
);
