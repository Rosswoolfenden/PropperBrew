import { MaterialIcons } from "@expo/vector-icons";
import { formatGbp, MAX_ORDER_QUANTITY, radius, shopifyCartUrl } from "@propperbrew/shared";
import * as WebBrowser from "expo-web-browser";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, themed, useColors } from "./theme";
import type { RouterOutputs } from "./trpc";
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

/** Fixed bottom bar: quantity stepper and the button that opens the roaster's checkout. */
export function OrderBar({
  variant,
  quantity,
  onQuantityChange,
  checkoutDomain,
}: {
  variant: Variant;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  checkoutDomain: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  const order = () =>
    // An in-app browser sheet on iOS/Android, so people land back here after checkout.
    WebBrowser.openBrowserAsync(shopifyCartUrl(checkoutDomain, variant.shopifyVariantId, quantity));

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.barRow}>
        <View style={styles.stepper}>
          <StepButton icon="remove" label="Fewer" disabled={quantity <= 1} onPress={() => onQuantityChange(quantity - 1)} />
          <Text style={styles.quantity} aria-label={`Quantity ${quantity}`}>
            {quantity}
          </Text>
          <StepButton
            icon="add"
            label="More"
            disabled={quantity >= MAX_ORDER_QUANTITY}
            onPress={() => onQuantityChange(quantity + 1)}
          />
        </View>
        <Button label={`Order · ${formatGbp(variant.pricePence * quantity)}`} onPress={order} style={{ flex: 1 }} />
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
  }),
);
