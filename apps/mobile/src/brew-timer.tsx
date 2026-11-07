import { formatDuration, radius, type RecipeStep } from "@propperbrew/shared";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fonts, themed } from "./theme";
import { Button } from "./ui";

/** Index of the step that's under way `elapsed` seconds into the brew, or -1 before the first. */
export function activeStepIndex(steps: readonly RecipeStep[], elapsed: number): number {
  let active = -1;
  steps.forEach((s, i) => {
    if (s.time <= elapsed) active = i;
  });
  return active;
}

/**
 * A stopwatch measured against the wall clock, so it stays accurate if ticks are delayed.
 * It checks four times a second but only re-renders when the whole second changes.
 */
export function useBrewTimer() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [bankedMs, setBankedMs] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null) return;
    // Same number as last time → React skips the render.
    const tick = () => setElapsed(Math.floor((bankedMs + Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [startedAt, bankedMs]);

  return {
    elapsed,
    running: startedAt !== null,
    start: () => setStartedAt(Date.now()),
    pause: () => {
      if (startedAt === null) return;
      const banked = bankedMs + Date.now() - startedAt;
      setBankedMs(banked);
      setElapsed(Math.floor(banked / 1000));
      setStartedAt(null);
    },
    reset: () => {
      setStartedAt(null);
      setBankedMs(0);
      setElapsed(0);
    },
  };
}

/** The design's "Timer ready / 00:00 / Start brewing" card. */
export function BrewTimerCard({
  timer,
  steps,
  totalSeconds,
}: {
  timer: ReturnType<typeof useBrewTimer>;
  steps: readonly RecipeStep[];
  totalSeconds: number | null;
}) {
  const styles = useStyles();
  const { elapsed, running } = timer;
  const done = totalSeconds !== null && elapsed >= totalSeconds;
  const step = steps[activeStepIndex(steps, elapsed)];

  const status = done
    ? "Brew complete"
    : running
      ? (step?.title ?? "Brewing")
      : elapsed > 0
        ? "Paused"
        : "Timer ready";

  return (
    <View style={styles.card}>
      <Text style={styles.status} aria-live="polite">
        {status}
      </Text>
      <Text style={styles.clock} aria-label={`Brew time ${formatDuration(elapsed)}`}>
        {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
      </Text>
      {totalSeconds !== null && <Text style={styles.target}>Target {formatDuration(totalSeconds)}</Text>}
      <View style={{ alignSelf: "stretch", gap: 8 }}>
        {running ? (
          <Button label="Pause" icon="pause" onPress={timer.pause} />
        ) : (
          <Button label={elapsed > 0 ? "Resume" : "Start brewing"} icon="play-arrow" onPress={timer.start} />
        )}
        {elapsed > 0 && <Button label="Reset" variant="text" onPress={timer.reset} />}
      </View>
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    card: {
      alignItems: "center",
      gap: 4,
      padding: 40,
      borderRadius: radius.xl,
      backgroundColor: c.surfaceContainerHigh,
      shadowColor: c.onSurface,
      shadowOpacity: 0.06,
      shadowRadius: 64,
      shadowOffset: { width: 0, height: 32 },
    },
    status: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: c.onSurfaceVariant },
    clock: { fontFamily: fonts.title, fontSize: 80, lineHeight: 96, color: c.primary, fontVariant: ["tabular-nums"] },
    target: { fontFamily: fonts.bodyItalic, fontSize: 15, color: c.onSurfaceVariant, marginBottom: 28 },
  }),
);
