import { MaterialIcons } from "@expo/vector-icons";
import { formatGbp, MAX_ORDER_QUANTITY, radius, shopifyCartUrl } from "@propperbrew/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, themed, useColors } from "./theme";
import { useSession } from "./session";
import { useTRPC, type RouterOutputs } from "./trpc";
import { Button, GUTTER } from "./ui";

type Variant = RouterOutputs["beans"]["bySlug"]["variants"][number];

/** Height the order bar covers, so scroll content can clear it. */
export const ORDER_BAR_HEIGHT = 84;

/** Sizes/grinds as a single-choice list. */
export function SizeOptions({
  variants,
  selectedId,
  onSelect,
}: {
  variants: Variant[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const styles = useStyles();
  return (
    <View role="radiogroup" aria-label="Size" style={{ gap: 4 }}>
      {variants.map((v) => {
        const selected = v.id === selectedId;
        return (
          <Pressable
            key={v.id}
            role="radio"
            aria-checked={selected}
            onPress={() => onSelect(v.id)}
            style={[styles.option, selected && styles.optionSelected]}
          >
            <Text style={[styles.optionTitle, selected && styles.onSelected]}>{v.title}</Text>
            <Text style={[styles.optionPrice, selected && styles.onSelected]}>{formatGbp(v.pricePence)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Fixed bottom bar: quantity stepper, then either "Add to basket" (roasters paid through
 * PropperBrew) or "Order", which opens the roaster's own Shopify checkout.
 */
export function OrderBar({
  variant,
  quantity,
  onQuantityChange,
  checkoutDomain,
  inAppCheckout,
}: {
  variant: Variant;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  checkoutDomain: string;
  inAppCheckout: boolean;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [added, setAdded] = useState<string | null>(null);
  const add = useMutation(
    trpc.basket.add.mutationOptions({
      onSuccess: (basket) => {
        queryClient.setQueryData(trpc.basket.get.queryKey(), basket);
        setAdded(`Added ${quantity} × ${variant.title}`);
      },
    }),
  );
  const price = formatGbp(variant.pricePence * quantity);

  const order = () =>
    // An in-app browser sheet on iOS/Android, so people land back here after checkout.
    WebBrowser.openBrowserAsync(shopifyCartUrl(checkoutDomain, variant.shopifyVariantId, quantity));
  const addToBasket = () => {
    if (!session) return router.push("/sign-in");
    add.mutate({ variantId: variant.id, quantity });
  };
  const changeQuantity = (n: number) => {
    setAdded(null);
    onQuantityChange(n);
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {(added || add.error) && (
        <View role={added ? "status" : "alert"} style={styles.notice}>
          <Text style={styles.noticeText}>{added ?? add.error?.message}</Text>
          {added && (
            <Link href="/basket" asChild>
              <Pressable role="link">
                <Text style={styles.noticeLink}>View basket →</Text>
              </Pressable>
            </Link>
          )}
        </View>
      )}
      <View style={styles.barRow}>
        <View style={styles.stepper}>
          <StepButton icon="remove" label="Fewer" disabled={quantity <= 1} onPress={() => changeQuantity(quantity - 1)} />
          <Text style={styles.quantity} aria-label={`Quantity ${quantity}`}>
            {quantity}
          </Text>
          <StepButton
            icon="add"
            label="More"
            disabled={quantity >= MAX_ORDER_QUANTITY}
            onPress={() => changeQuantity(quantity + 1)}
          />
        </View>
        {inAppCheckout ? (
          <Button
            // Short, like "Order · £14.00", so it fits beside the stepper on a phone.
            label={add.isPending ? "Adding…" : `Add · ${price}`}
            disabled={add.isPending}
            onPress={addToBasket}
            style={{ flex: 1 }}
          />
        ) : (
          <Button label={`Order · ${price}`} onPress={order} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "add" | "remove";
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      role="button"
      aria-label={label}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1 }}
    >
      <MaterialIcons name={icon} size={20} color={colors.primary} />
    </Pressable>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: radius.md,
      backgroundColor: c.surfaceContainerLow,
    },
    optionSelected: { backgroundColor: c.surfaceTint },
    optionTitle: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: c.onSurface },
    optionPrice: { fontFamily: fonts.labelBold, fontSize: 16, color: c.primary },
    onSelected: { color: c.onPrimary },
    // The design's glass bar is surface at 90% plus a backdrop blur; without the blur, stay near-opaque.
    bar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: 16,
      paddingHorizontal: GUTTER,
      gap: 8,
      backgroundColor: `${c.surface}F7`,
      shadowColor: c.onSurface,
      shadowOpacity: 0.04,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: -4 },
    },
    barRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    stepper: {
      flexDirection: "row",
      alignItems: "center",
      height: 52,
      paddingHorizontal: 4,
      borderRadius: radius.md,
      backgroundColor: c.surfaceContainerHighest,
    },
    quantity: { width: 28, textAlign: "center", fontFamily: fonts.labelBold, fontSize: 15, color: c.primary },
    notice: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.secondaryContainer },
    noticeText: { flex: 1, fontFamily: fonts.label, fontSize: 13, color: c.onSecondaryContainer },
    noticeLink: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: c.onSecondaryContainer },
  }),
);
