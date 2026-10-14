import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  BREW_METHOD_LABELS,
  BREW_METHODS,
  brewRatio,
  CreateBrewRecipeInput,
  parseDuration,
  type BrewMethod,
} from "@propperbrew/shared";
import { useSession } from "@/session";
import { fonts, themed } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Eyebrow, Field, FilterChip, GUTTER, Headline, Loading } from "@/ui";

type StepDraft = { key: number; time: string; water: string; title: string; note: string };
type Errors = Partial<Record<string, string>>;

/** Friendly messages for the schema's range checks, keyed by input path. */
const MESSAGES: Record<string, string> = {
  coffeeDoseG: "Enter a dose up to 100g",
  waterWeightG: "Enter up to 5,000g of water",
  waterTempC: "Enter a temperature between 0 and 100°C",
  totalBrewTimeSeconds: "Enter a time like 2:45",
  steps: "Steps need to be in time order",
};

/** Blank → undefined; otherwise a number, or NaN so validation flags it. */
const optionalNumber = (text: string) => (text.trim() === "" ? undefined : Number(text.replace(",", ".")));
const optionalText = (text: string) => text.trim() || undefined;

export default function NewRecipeScreen() {
  const { beanId, beanName } = useLocalSearchParams<{ beanId: string; beanName?: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { session, ready } = useSession();
  const styles = useStyles();

  const [method, setMethod] = useState<BrewMethod>("v60");
  const [dose, setDose] = useState("");
  const [water, setWater] = useState("");
  const [temp, setTemp] = useState("");
  const [time, setTime] = useState("");
  const [grinder, setGrinder] = useState("");
  const [setting, setSetting] = useState("");
  const [notes, setNotes] = useState("");
  const nextKey = useRef(1);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [errors, setErrors] = useState<Errors>({});

  const create = useMutation(
    trpc.recipes.create.mutationOptions({
      onSuccess: ({ id }) => {
        queryClient.invalidateQueries({ queryKey: trpc.recipes.pathKey() });
        router.replace({ pathname: "/recipe/[id]", params: { id } });
      },
    }),
  );

  if (!ready) return <Loading />;
  if (!session) {
    return (
      <View style={styles.signedOut}>
        <Headline size="section">Share your recipe</Headline>
        <Body italic muted>
          Sign in to add how you brew this coffee.
        </Body>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to add a recipe" />
        </Link>
      </View>
    );
  }

  const updateStep = (key: number, patch: Partial<StepDraft>) =>
    setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const submit = () => {
    const found: Errors = {};
    // Say what's missing or mistyped before the schema's range checks get a say.
    const checkNumber = (key: string, text: string, required: string | null) => {
      if (text.trim() === "") {
        if (required) found[key] = required;
      } else if (Number.isNaN(Number(text.replace(",", ".")))) found[key] = "Enter a number";
    };
    checkNumber("coffeeDoseG", dose, "Enter the coffee dose");
    checkNumber("waterWeightG", water, "Enter the total water");
    checkNumber("waterTempC", temp, null);
    const brewTime = time.trim() === "" ? undefined : (parseDuration(time) ?? NaN);
    const parsedSteps = steps.map((s, i) => {
      const at = parseDuration(s.time);
      if (at === null) found[`steps.${i}.time`] = "Enter a time like 0:30";
      return { time: at ?? 0, water: optionalNumber(s.water), title: optionalText(s.title), note: optionalText(s.note) };
    });
    const result = CreateBrewRecipeInput.safeParse({
      coffeeBeanId: beanId,
      brewMethod: method,
      coffeeDoseG: optionalNumber(dose) ?? NaN,
      waterWeightG: optionalNumber(water) ?? NaN,
      waterTempC: optionalNumber(temp),
      grinderModel: optionalText(grinder),
      grindSetting: optionalText(setting),
      totalBrewTimeSeconds: brewTime,
      steps: parsedSteps,
      notes: optionalText(notes),
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        found[path] ??= MESSAGES[path] ?? (path.endsWith(".water") ? "Enter grams of water" : issue.message);
      }
    }
    setErrors(found);
    if (result.success && Object.keys(found).length === 0) create.mutate(result.data);
  };

  const ratio = Number(dose) > 0 && Number(water) > 0 ? brewRatio(Number(dose), Number(water)) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 16 }}>
          <View style={styles.byline}>
            <Eyebrow>Your recipe for</Eyebrow>
            <View style={styles.rule} />
            {beanName && <Text style={styles.beanName}>{beanName}</Text>}
          </View>
          <Text role="heading" style={styles.title}>
            Add your recipe
          </Text>
        </View>

        <View role="radiogroup" aria-label="Brew method" style={styles.section}>
          <Eyebrow>Brew method</Eyebrow>
          <View style={styles.chips}>
            {BREW_METHODS.map((m) => (
              <FilterChip key={m} label={BREW_METHOD_LABELS[m]} selected={method === m} onPress={() => setMethod(m)} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.spaced}>
            <Headline size="section">Parameters</Headline>
            {ratio && <Eyebrow style={styles.ratio}>Ratio {ratio}</Eyebrow>}
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Field label="Coffee dose (g)" placeholder="15" keyboardType="decimal-pad" value={dose} onChangeText={setDose} error={errors.coffeeDoseG} />
            </View>
            <View style={styles.cell}>
              <Field label="Total water (g)" placeholder="250" keyboardType="decimal-pad" value={water} onChangeText={setWater} error={errors.waterWeightG} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Field label="Temperature (°C)" placeholder="94" keyboardType="decimal-pad" value={temp} onChangeText={setTemp} error={errors.waterTempC} />
            </View>
            <View style={styles.cell}>
              <Field label="Brew time" placeholder="2:45" value={time} onChangeText={setTime} error={errors.totalBrewTimeSeconds} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Field label="Grinder" placeholder="Comandante C40" value={grinder} onChangeText={setGrinder} />
            </View>
            <View style={styles.cell}>
              <Field label="Grind setting" placeholder="24 clicks" value={setting} onChangeText={setSetting} />
            </View>
          </View>
          <Field
            label="Notes"
            placeholder="What makes this recipe work?"
            multiline
            value={notes}
            onChangeText={setNotes}
            style={{ minHeight: 120, textAlignVertical: "top" }}
          />
        </View>

        <View style={styles.section}>
          <Headline size="section">The Ritual</Headline>
          <Body italic muted>
            Optional: the steps, with the time each one starts.
          </Body>
          {errors.steps && <Text style={styles.error}>{errors.steps}</Text>}
          {steps.map((s, i) => (
            <View key={s.key} style={styles.step}>
              <View style={styles.spaced}>
                <Text style={styles.stepNumber}>{String(i + 1).padStart(2, "0")}</Text>
                <Button
                  label="Remove"
                  variant="text"
                  onPress={() => setSteps((all) => all.filter((x) => x.key !== s.key))}
                />
              </View>
              <Field label={`Step ${i + 1} title`} placeholder="The bloom" value={s.title} onChangeText={(v) => updateStep(s.key, { title: v })} />
              <View style={styles.row}>
                <View style={styles.cell}>
                  <Field
                    label={`Step ${i + 1} starts at`}
                    placeholder="0:30"
                    value={s.time}
                    onChangeText={(v) => updateStep(s.key, { time: v })}
                    error={errors[`steps.${i}.time`]}
                  />
                </View>
                <View style={styles.cell}>
                  <Field
                    label={`Step ${i + 1} water to (g)`}
                    placeholder="150"
                    keyboardType="decimal-pad"
                    value={s.water}
                    onChangeText={(v) => updateStep(s.key, { water: v })}
                    error={errors[`steps.${i}.water`]}
                  />
                </View>
              </View>
              <Field
                label={`Step ${i + 1} instructions`}
                placeholder="Spiral outward then back in…"
                multiline
                value={s.note}
                onChangeText={(v) => updateStep(s.key, { note: v })}
                style={{ minHeight: 80, textAlignVertical: "top" }}
              />
            </View>
          ))}
          <Button
            label="Add step"
            icon="add"
            variant="secondary"
            onPress={() => setSteps((all) => [...all, { key: nextKey.current++, time: "", water: "", title: "", note: "" }])}
          />
        </View>

        {create.error && <Text style={styles.error}>Couldn&apos;t share your recipe. Please try again.</Text>}
        <Button label={create.isPending ? "Sharing…" : "Share recipe"} disabled={create.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 48 },
    signedOut: { padding: GUTTER, gap: 16 },
    byline: { flexDirection: "row", alignItems: "baseline", gap: 12 },
    rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: `${c.outlineVariant}33` },
    beanName: { fontFamily: fonts.bodyItalic, fontSize: 16, color: c.secondary },
    title: { fontFamily: fonts.title, fontSize: 44, lineHeight: 48, letterSpacing: -1, color: c.primary },
    section: { gap: 20 },
    spaced: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
    ratio: { color: c.primary, fontFamily: fonts.labelBold },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    row: { flexDirection: "row", gap: 12 },
    cell: { flex: 1 },
    step: { gap: 16, padding: 20, borderRadius: 12, backgroundColor: c.surfaceContainerLow },
    stepNumber: { fontFamily: fonts.headline, fontSize: 40, lineHeight: 44, color: `${c.outlineVariant}80` },
    error: { fontFamily: fonts.label, fontSize: 13, color: c.error },
  }),
);
