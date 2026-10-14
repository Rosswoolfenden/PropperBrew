import { MaterialIcons } from "@expo/vector-icons";
import { radius } from "@propperbrew/shared";
import type { ComponentProps, ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { fonts, themed, useColors } from "./theme";

/** Horizontal screen gutter from the design system (spacing-6). */
export const GUTTER = 24;

type IconName = ComponentProps<typeof MaterialIcons>["name"];

/** Small uppercase metadata label, e.g. "ROAST LEVEL". */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const s = useStyles();
  return <Text style={[s.eyebrow, style]}>{children}</Text>;
}

export function Headline({ children, size = "title" }: { children: ReactNode; size?: "display" | "title" | "section" }) {
  const s = useStyles();
  return (
    <Text role="heading" style={[s.headline, s[size]]}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  italic,
  muted,
  style,
}: {
  children: ReactNode;
  italic?: boolean;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const s = useStyles();
  return <Text style={[s.body, italic && s.italic, muted && s.muted, style]}>{children}</Text>;
}

/** Terracotta flavour chip. */
export function Chip({ label, small }: { label: string; small?: boolean }) {
  const s = useStyles();
  return (
    <View style={[s.chip, small && s.chipSmall]}>
      <Text style={[s.chipText, small && s.chipTextSmall]}>{label}</Text>
    </View>
  );
}

export function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const s = useStyles();
  return (
    <Pressable
      role="button"
      aria-selected={selected}
      onPress={onPress}
      style={({ pressed }) => [s.filter, selected && s.filterSelected, pressed && s.pressed]}
    >
      <Text style={[s.filterText, selected && s.filterTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "text";
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const colors = useColors();
  const fg = variant === "primary" ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      role="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.button, s[variant], pressed && s.pressed, disabled && s.disabled, style]}
    >
      {icon && <MaterialIcons name={icon} size={18} color={fg} />}
      <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  const s = useStyles();
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Eyebrow style={{ marginLeft: 4 }}>{label}</Eyebrow>
      <TextInput aria-label={label} placeholderTextColor={colors.outline} style={s.input} {...input} />
    </View>
  );
}

/** Five stars, filled to the nearest whole star. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const colors = useColors();
  const filled = Math.round(value);
  return (
    <View role="img" aria-label={`${value.toFixed(1)} out of 5`} style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialIcons
          key={i}
          name="star"
          size={size}
          color={colors.primary}
          style={i > filled ? { opacity: 0.25 } : undefined}
        />
      ))}
    </View>
  );
}

export function Rating({ value, count }: { value: number; count: number }) {
  const s = useStyles();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Stars value={value} />
      <Text style={s.ratingCount}>
        {value.toFixed(1)} ({count} {count === 1 ? "review" : "reviews"})
      </Text>
    </View>
  );
}

/** Rounded image on a tonal block, so a missing image still holds the layout. */
export function Frame({ uri, aspectRatio = 1, style }: { uri: string | null; aspectRatio?: number; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  return <View style={[s.frame, { aspectRatio }, style]}>{uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} />}</View>;
}

/** Icon tile + label + value, from the design's brewing guide. */
export function Step({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  const s = useStyles();
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
      <View style={s.stepIcon}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Body muted>{children}</Body>
      </View>
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    eyebrow: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: c.onSurfaceVariant },
    headline: { fontFamily: fonts.headline, color: c.primary },
    display: { fontSize: 36, lineHeight: 38, letterSpacing: -1.5 },
    title: { fontFamily: fonts.title, fontSize: 20, lineHeight: 24, letterSpacing: -0.3 },
    section: { fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },
    body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: c.onSurface },
    italic: { fontFamily: fonts.bodyItalic },
    muted: { color: c.onSurfaceVariant },
    chip: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: radius.xl, backgroundColor: c.secondaryContainer },
    chipSmall: { alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.sm },
    chipText: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: c.onSecondaryContainer },
    chipTextSmall: { fontSize: 9 },
    filter: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.xl, backgroundColor: c.surfaceContainerHigh },
    filterSelected: { backgroundColor: c.surfaceTint },
    filterText: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: c.onSurfaceVariant },
    filterTextSelected: { color: c.onPrimary },
    button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, paddingHorizontal: 20, borderRadius: radius.md },
    primary: { backgroundColor: c.surfaceTint },
    secondary: { backgroundColor: c.surfaceContainerHigh },
    text: { minHeight: 40 },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.5 },
    buttonText: { fontFamily: fonts.labelBold, fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase" },
    input: { fontFamily: fonts.body, fontSize: 17, color: c.onSurface, backgroundColor: c.surfaceContainerHighest, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 16 },
    ratingCount: { fontFamily: fonts.label, fontSize: 12, color: c.onSurfaceVariant },
    frame: { width: "100%", overflow: "hidden", borderRadius: radius.xl, backgroundColor: c.surfaceContainerHigh },
    stepIcon: { width: 48, height: 48, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceContainerHighest },
    stepTitle: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: c.primary },
  }),
);
