import { useQuery } from "@tanstack/react-query";
import { formatGbp, radius } from "@propperbrew/shared";
import { Link } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, themed } from "@/theme";
import { useSession } from "@/session";
import { useTRPC } from "@/trpc";
import { Body, Button, GUTTER, Loading } from "@/ui";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function OrdersScreen() {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const styles = useStyles();
  const orders = useQuery({ ...trpc.orders.list.queryOptions(), enabled: !!session });

  if (!ready || (session && orders.isPending)) return <Loading />;
  if (!session) {
    return (
      <View style={styles.message}>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to see your orders" />
        </Link>
      </View>
    );
  }
  if (orders.error) return <Body muted style={styles.message}>We couldn&apos;t load your orders.</Body>;
  return (
    <FlatList
      data={orders.data}
      keyExtractor={(o) => o.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Body muted>No orders yet.</Body>}
      renderItem={({ item: o }) => (
        <Link href={{ pathname: "/order/[id]", params: { id: o.id } }} asChild>
          <Pressable role="link" aria-label={`Order ${o.reference}`} style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.reference}>{o.reference}</Text>
              <Body muted style={{ fontSize: 15 }}>
                {dateFormat.format(o.createdAt)} · {o.items} {o.items === 1 ? "bag" : "bags"} from {o.roasters.join(", ")}
              </Body>
            </View>
            <Text style={styles.reference}>{formatGbp(o.totalPence)}</Text>
          </Pressable>
        </Link>
      )}
    />
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    message: { padding: GUTTER, gap: 24 },
    list: { padding: GUTTER, gap: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 16, padding: 18, borderRadius: radius.lg, backgroundColor: c.surfaceContainerLow },
    reference: { fontFamily: fonts.title, fontSize: 16, color: c.primary },
  }),
);
