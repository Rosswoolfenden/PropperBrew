import { radius, SENSORY, SENSORY_DIMENSIONS, sensoryLevel, type FlavourScores } from "@propperbrew/shared";
import { StyleSheet, Text, View } from "react-native";
import { fonts, themed } from "./theme";

/** The community's average sensory profile for a coffee, as five 1–5 bars. */
export function SensoryProfile({ scores }: { scores: FlavourScores }) {
  const styles = useStyles();
  return (
    <View style={{ gap: 14 }} aria-label="Sensory profile">
      {SENSORY_DIMENSIONS.filter((d) => scores[d] !== undefined).map((d) => {
        const score = scores[d]!;
        return (
          // One accessible element per bar, so screen readers announce the summary, not the parts.
          <View key={d} accessible style={{ gap: 6 }} aria-label={`${SENSORY[d].label} ${score} of 5, ${sensoryLevel(d, score)}`}>
            <View style={styles.spaced}>
              <Text style={styles.label}>{SENSORY[d].label}</Text>
              <Text style={styles.level}>{sensoryLevel(d, score)}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(score / 5) * 100}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    spaced: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    label: { fontFamily: fonts.labelBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: c.primary },
    level: { fontFamily: fonts.bodyItalic, fontSize: 14, color: c.onSurfaceVariant },
    track: { height: 4, borderRadius: radius.sm, backgroundColor: c.surfaceContainerHighest, overflow: "hidden" },
    fill: { height: 4, borderRadius: radius.sm, backgroundColor: c.primary },
  }),
);
