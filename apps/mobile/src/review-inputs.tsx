import { MaterialIcons } from "@expo/vector-icons";
import { radius, SENSORY, sensoryLevel, type SensoryDimension } from "@propperbrew/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, themed, useColors } from "./theme";

/** The design's "Overall experience" card: tap a star to rate 1–5. */
export function StarRating({ value, onChange }: { value: number | null; onChange: (rating: number) => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View role="radiogroup" aria-label="Your rating" style={styles.starCard}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        return (
          <Pressable key={n} role="radio" aria-checked={value === n} aria-label={`${n} ${n === 1 ? "star" : "stars"}`} onPress={() => onChange(n)} hitSlop={6}>
            <MaterialIcons name="star" size={40} color={on ? colors.primary : colors.outlineVariant} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A sensory dimension on a 1–5 track (Stitch "Review Coffee"). Each stop is a radio; tapping
 * the chosen one again clears it, since every dimension is optional.
 */
export function SensorySlider({
  dimension,
  value,
  onChange,
}: {
  dimension: SensoryDimension;
  value: number | undefined;
  onChange: (score: number | undefined) => void;
}) {
  const styles = useStyles();
  const { label, low, high } = SENSORY[dimension];
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.spaced}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.level}>{value ? sensoryLevel(dimension, value) : "Not rated"}</Text>
      </View>
      <View role="radiogroup" aria-label={label} style={styles.track}>
        <View style={styles.line} />
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`${label} ${n} of 5, ${sensoryLevel(dimension, n)}`}
            onPress={() => onChange(value === n ? undefined : n)}
            style={styles.stop}
          >
            <View style={value === n ? styles.thumb : styles.dot} />
          </Pressable>
        ))}
      </View>
      <View style={styles.spaced}>
        <Text style={styles.end}>{low}</Text>
        <Text style={styles.end}>{high}</Text>
      </View>
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    starCard: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 12,
      paddingVertical: 20,
      borderRadius: radius.xl,
      backgroundColor: c.surfaceContainerLowest,
    },
    spaced: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    label: { fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: c.primary },
    level: { fontFamily: fonts.bodyItalic, fontSize: 15, color: c.onSurfaceVariant },
    track: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 36 },
    line: { position: "absolute", left: 18, right: 18, height: 2, borderRadius: 1, backgroundColor: c.surfaceContainerHighest },
    stop: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.outlineVariant },
    thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.primary },
    end: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: c.outline },
  }),
);
