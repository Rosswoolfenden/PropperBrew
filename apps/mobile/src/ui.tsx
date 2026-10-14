import { MaterialIcons } from "@expo/vector-icons";
import { radius } from "@propperbrew/shared";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
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

export function Loading() {
  const colors = useColors();
  return <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />;
}

/** Small uppercase metadata label, e.g. "ROAST LEVEL". */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useStyles();
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function Headline({ children, size = "title" }: { children: ReactNode; size?: "display" | "title" | "section" }) {
  const styles = useStyles();
  return (
    <Text role="heading" style={[styles.headline, styles[size]]}>
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
  const styles = useStyles();
  return <Text style={[styles.body, italic && styles.italic, muted && styles.muted, style]}>{children}</Text>;
}

/** Terracotta flavour chip. `small` is the squared tag style; add `pill` for the rounded one on cards. */
export function Chip({ label, small, pill }: { label: string; small?: boolean; pill?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.chip, small && styles.chipSmall, pill && styles.chipPill]}>
      <Text style={[styles.chipText, small && styles.chipTextSmall]}>{label}</Text>
    </View>
  );
}

export function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      role="button"
      aria-selected={selected}
      onPress={onPress}
      style={({ pressed }) => [styles.filter, selected && styles.filterSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
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
  const styles = useStyles();
  const colors = useColors();
  const fg = variant === "primary" ? colors.onPrimary : colors.primary;
  return (
    <Pressable
      role="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, styles[variant], pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      {icon && <MaterialIcons name={icon} size={18} color={fg} />}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, error, style, ...input }: { label: string; error?: string } & TextInputProps) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Eyebrow style={{ marginLeft: 4 }}>{label}</Eyebrow>
      <TextInput
        aria-label={label}
        aria-invalid={!!error}
        placeholderTextColor={colors.outline}
        style={[styles.input, error && styles.inputError, style]}
        {...input}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

/** Icon button for the top bar (the design's menu/avatar/close slots). */
export function HeaderIcon({ icon, label, onPress }: { icon: IconName; label: string; onPress?: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
    >
      <MaterialIcons name={icon} size={24} color={colors.primary} />
    </Pressable>
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
  const styles = useStyles();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Stars value={value} />
      <Text style={styles.ratingCount}>
        {value.toFixed(1)} ({count} {count === 1 ? "review" : "reviews"})
      </Text>
    </View>
  );
}

/**
 * Rounded image on a tonal block, so a missing image still holds the layout.
 * `fit="contain"` insets the image, for product shots of a bag on a plain background.
 */
export function Frame({
  uri,
  aspectRatio = 1,
  fit = "cover",
  style,
}: {
  uri: string | null;
  aspectRatio?: number;
  fit?: "cover" | "contain";
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.frame, { aspectRatio }, style]}>
      {uri && (
        <Image
          source={{ uri }}
          resizeMode={fit}
          style={[StyleSheet.absoluteFill, fit === "contain" && { margin: 24 }]}
        />
      )}
    </View>
  );
}

/** Icon tile + label + value, from the design's brewing guide. */
export function Step({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-start" }}>
      <View style={styles.stepIcon}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.stepTitle}>{title}</Text>
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
    chipPill: { borderRadius: radius.xl },
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
    // Bottom-only accent on error, like the design's focus state, rather than a full outline.
    inputError: { borderBottomWidth: 2, borderBottomColor: c.error },
    error: { marginLeft: 4, fontFamily: fonts.label, fontSize: 12, color: c.error },
    ratingCount: { fontFamily: fonts.label, fontSize: 12, color: c.onSurfaceVariant },
    frame: { width: "100%", overflow: "hidden", borderRadius: radius.xl, backgroundColor: c.surfaceContainerHigh },
    stepIcon: { width: 48, height: 48, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceContainerHighest },
    stepTitle: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: c.primary },
  }),
);
