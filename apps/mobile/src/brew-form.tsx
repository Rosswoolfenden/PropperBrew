import { BREW_METHOD_LABELS, BREW_METHODS, BrewLogInput, brewRatio, formatDuration, parseDuration, type BrewMethod } from "@propperbrew/shared";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { StarRating } from "./review-inputs";
import { fonts, themed, useColors } from "./theme";
import { Body, Button, Eyebrow, Field, FilterChip } from "./ui";

/** What the form starts from: a brew being edited, the last brew of this coffee, or a recipe. */
export type BrewStart = {
  brewMethod: BrewMethod;
  coffeeDoseG: number;
  waterWeightG: number;
  waterTempC: number | null;
  grinderModel: string | null;
  grindSetting: string | null;
  totalBrewTimeSeconds: number | null;
  rating?: number | null;
  notes?: string | null;
};

const MESSAGES: Record<string, string> = {
  coffeeDoseG: "Enter a dose up to 100g",
  waterWeightG: "Enter up to 5,000g of water",
  waterTempC: "Enter a temperature between 0 and 100°C",
  totalBrewTimeSeconds: "Enter a time like 2:45",
};
const num = (text: string) => (text.trim() === "" ? undefined : Number(text.replace(",", ".")));

/** Log or edit one brew: method, dose, water, temperature, grind, time, stars and notes. */
export function BrewForm({
  start,
  links,
  submitLabel,
  busy,
  serverError,
  onSubmit,
}: {
  start: BrewStart | null;
  links: Pick<BrewLogInput, "coffeeBeanId" | "shelfEntryId" | "recipeId">;
  submitLabel: string;
  busy: boolean;
  serverError?: string;
  onSubmit: (input: BrewLogInput) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [method, setMethod] = useState<BrewMethod>(start?.brewMethod ?? "v60");
  const [f, setF] = useState({
    dose: start ? String(start.coffeeDoseG) : "",
    water: start ? String(start.waterWeightG) : "",
    temp: start?.waterTempC != null ? String(start.waterTempC) : "",
    grinder: start?.grinderModel ?? "",
    grind: start?.grindSetting ?? "",
    time: start?.totalBrewTimeSeconds ? formatDuration(start.totalBrewTimeSeconds) : "",
    notes: start?.notes ?? "",
  });
  const [rating, setRating] = useState<number | null>(start?.rating ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof f) => (text: string) => setF((x) => ({ ...x, [key]: text }));

  const dose = num(f.dose);
  const water = num(f.water);
  const ratio = dose && water && dose > 0 ? brewRatio(dose, water) : null;

  const submit = () => {
    const found: Record<string, string> = {};
    if (!f.dose.trim()) found.coffeeDoseG = "Enter the coffee dose";
    if (!f.water.trim()) found.waterWeightG = "Enter the water";
    const time = f.time.trim() ? parseDuration(f.time) : null;
    if (f.time.trim() && time === null) found.totalBrewTimeSeconds = MESSAGES.totalBrewTimeSeconds!;
    const input = {
      ...links,
      brewMethod: method,
      coffeeDoseG: dose ?? NaN,
      waterWeightG: water ?? NaN,
      waterTempC: num(f.temp) ?? null,
      grinderModel: f.grinder.trim() || null,
      grindSetting: f.grind.trim() || null,
      totalBrewTimeSeconds: time,
      rating,
      notes: f.notes.trim() || null,
    };
    const result = BrewLogInput.safeParse(input);
    if (!result.success) for (const issue of result.error.issues) found[String(issue.path[0])] ??= MESSAGES[String(issue.path[0])] ?? "Check this value";
    setErrors(found);
    if (result.success && Object.keys(found).length === 0) onSubmit(input);
  };

  return (
    <View role="form" aria-label="Brew" style={{ gap: 24 }}>
      <View role="radiogroup" aria-label="Brew method" style={{ gap: 8 }}>
        <Eyebrow style={{ marginLeft: 4 }}>Method</Eyebrow>
        {/* Wrapped, not scrolled, so the chosen method is always in view. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {BREW_METHODS.map((m) => (
            <FilterChip key={m} label={BREW_METHOD_LABELS[m]} selected={method === m} onPress={() => setMethod(m)} />
          ))}
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Coffee (g)" inputMode="decimal" placeholder="15" value={f.dose} onChangeText={set("dose")} error={errors.coffeeDoseG} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Water (g)" inputMode="decimal" placeholder="250" value={f.water} onChangeText={set("water")} error={errors.waterWeightG} />
        </View>
      </View>
      {ratio && (
        <Text style={styles.ratio} aria-label={`Ratio ${ratio}`}>
          Ratio {ratio}
        </Text>
      )}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Temperature (°C)" inputMode="decimal" placeholder="94" value={f.temp} onChangeText={set("temp")} error={errors.waterTempC} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Brew time" placeholder="2:45" value={f.time} onChangeText={set("time")} error={errors.totalBrewTimeSeconds} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Grinder" placeholder="Comandante C40" value={f.grinder} onChangeText={set("grinder")} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Grind" placeholder="22 clicks" value={f.grind} onChangeText={set("grind")} />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Eyebrow style={{ marginLeft: 4 }}>How was it?</Eyebrow>
        <StarRating value={rating} onChange={setRating} />
      </View>
      <Field
        label="Notes"
        placeholder="Sweeter than last time; try a touch finer."
        multiline
        value={f.notes}
        onChangeText={set("notes")}
        maxLength={2000}
        style={{ minHeight: 100, textAlignVertical: "top" }}
      />
      {serverError && (
        <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
          {serverError}
        </Text>
      )}
      {Object.keys(errors).length > 0 && <Body style={{ color: colors.error, fontSize: 14 }}>Check the highlighted fields.</Body>}
      <Button label={busy ? "Saving…" : submitLabel} disabled={busy} onPress={submit} />
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: 12 },
    ratio: { marginTop: -12, marginLeft: 4, fontFamily: fonts.labelBold, fontSize: 12, letterSpacing: 1, color: c.secondary },
  }),
);
