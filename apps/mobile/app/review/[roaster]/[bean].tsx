import { MaterialIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  CreateReviewInput,
  formatAltitude,
  humanize,
  radius,
  SENSORY_DIMENSIONS,
  type FlavourScores,
} from "@propperbrew/shared";
import { SensorySlider, StarRating } from "@/review-inputs";
import { useSession } from "@/session";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { PhotoField } from "@/photo";
import { Body, Button, Eyebrow, Field, Frame, GUTTER, Headline, Loading } from "@/ui";

const MAX_NOTES = 12;

export default function ReviewScreen() {
  const { roaster, bean: beanSlug } = useLocalSearchParams<{ roaster: string; bean: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { session, ready } = useSession();
  const styles = useStyles();
  const colors = useColors();

  const bean = useQuery(trpc.beans.bySlug.queryOptions({ roasterSlug: roaster, beanSlug }));
  const mine = useQuery({
    ...trpc.reviews.mine.queryOptions({ coffeeBeanId: bean.data?.id ?? "" }),
    enabled: !!session && !!bean.data,
  });

  const [rating, setRating] = useState<number | null>(null);
  const [scores, setScores] = useState<FlavourScores>({});
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState("");
  const [body, setBody] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Editing an existing review: start from what they said last time (once).
  useEffect(() => {
    if (loaded || mine.isPending) return;
    if (mine.data) {
      setRating(Math.round(mine.data.rating));
      setScores(mine.data.flavourScores ?? {});
      setNotes(mine.data.tastingNotes);
      setBody(mine.data.body ?? "");
      setPhotoUrl(mine.data.photoUrl);
    }
    setLoaded(true);
  }, [loaded, mine.isPending, mine.data]);

  const save = useMutation(
    trpc.reviews.upsert.mutationOptions({
      onSuccess: () => {
        // The coffee's rating, count, sensory profile and review list all change.
        queryClient.invalidateQueries({ queryKey: trpc.reviews.pathKey() });
        queryClient.invalidateQueries({ queryKey: trpc.beans.pathKey() });
        queryClient.invalidateQueries({ queryKey: trpc.shelf.pathKey() });
        // Opened straight from a link there's nothing to go back to: show the coffee, review and all.
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: "/bean/[roaster]/[bean]", params: { roaster, bean: beanSlug } });
      },
      onError: () => setError("Couldn't post your review. Please try again."),
    }),
  );

  if (!ready || bean.isPending) return <Loading />;
  if (!bean.data) return <Body style={{ padding: GUTTER }}>Coffee not found.</Body>;
  if (!session) {
    return (
      <View style={styles.signedOut}>
        <Headline size="section">Review {bean.data.name}</Headline>
        <Body italic muted>
          Sign in to rate this coffee and share your tasting notes.
        </Body>
        <Link href="/sign-in" asChild>
          <Button label="Sign in to review" />
        </Link>
      </View>
    );
  }
  if (!loaded) return <Loading />;

  const b = bean.data;
  const suggestions = [...new Set([...b.tastingNotes, ...notes])];
  const toggleNote = (note: string) =>
    setNotes((all) => (all.includes(note) ? all.filter((n) => n !== note) : all.length < MAX_NOTES ? [...all, note] : all));
  const addNote = () => {
    const note = newNote.trim();
    if (note && !notes.some((n) => n.toLowerCase() === note.toLowerCase())) toggleNote(note);
    setNewNote("");
  };

  const submit = () => {
    if (rating === null) return setError("Choose a star rating.");
    const input = CreateReviewInput.safeParse({
      coffeeBeanId: b.id,
      rating,
      tastingNotes: notes,
      body: body.trim() || undefined,
      flavourScores: scores,
      photoUrl,
    });
    if (!input.success) return setError("Check your review and try again.");
    setError(null);
    save.mutate(input.data);
  };

  const subtitle = [b.originCountry, b.roastLevel && `${humanize(b.roastLevel)} roast`].filter(Boolean).join(" • ");
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.summary}>
          <Frame uri={b.imageUrl} aspectRatio={3 / 4} fit="contain" style={styles.bag} />
          <Text role="heading" style={styles.title}>
            {b.name}
          </Text>
          {subtitle ? (
            <Body italic muted style={{ fontSize: 18, textAlign: "center" }}>
              {subtitle}
            </Body>
          ) : null}
          <View style={styles.stats}>
            {b.altitudeMasl ? <Stat label="Altitude" value={formatAltitude(b.altitudeMasl)} /> : null}
            {b.process ? <Stat label="Process" value={humanize(b.process)} /> : null}
          </View>
        </View>

        <View style={{ gap: 16 }}>
          <View style={styles.spaced}>
            <Eyebrow>Your rating</Eyebrow>
            <Body italic muted style={{ fontSize: 14 }}>
              Required
            </Body>
          </View>
          <StarRating value={rating} onChange={(n) => (setRating(n), setError(null))} />
        </View>

        <View style={{ gap: 32 }}>
          <View style={{ gap: 6 }}>
            <Headline size="section">Sensory Profile</Headline>
            <Body muted>Calibrate the characteristics of this roast based on your brew. Leave any you&apos;re unsure of.</Body>
          </View>
          {SENSORY_DIMENSIONS.map((d) => (
            <SensorySlider key={d} dimension={d} value={scores[d]} onChange={(v) => setScores((s) => ({ ...s, [d]: v }))} />
          ))}
        </View>

        <View style={{ gap: 16 }}>
          <Eyebrow>Tasting notes</Eyebrow>
          <View style={styles.chips}>
            {suggestions.map((n) => {
              const on = notes.includes(n);
              return (
                <Pressable key={n} role="checkbox" aria-checked={on} onPress={() => toggleNote(n)} style={[styles.note, on ? styles.noteOn : styles.noteOff]}>
                  <Text style={[styles.noteText, on && styles.noteTextOn]}>{n}</Text>
                  <MaterialIcons name={on ? "close" : "add"} size={14} color={on ? colors.onSecondaryContainer : colors.onSurfaceVariant} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.addNote}>
            <View style={{ flex: 1 }}>
              <Field label="Add a note" placeholder="Stone fruit" value={newNote} onChangeText={setNewNote} onSubmitEditing={addNote} returnKeyType="done" />
            </View>
            <Button label="Add" variant="secondary" onPress={addNote} disabled={!newNote.trim() || notes.length >= MAX_NOTES} />
          </View>
        </View>

        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Headline size="section">Editorial Notes</Headline>
            <Body muted>Describe the nuances of your experience with this bean.</Body>
          </View>
          <Field
            label="Your notes"
            placeholder="Describe the aroma, the first sip, and how it evolves as it cools…"
            multiline
            value={body}
            onChangeText={setBody}
            maxLength={4000}
            style={{ minHeight: 150, textAlignVertical: "top" }}
          />
          <PhotoField kind="review" label="Your photo (optional)" value={photoUrl} onChange={setPhotoUrl} />
        </View>

        {error && (
          <Text role="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <View style={{ gap: 16 }}>
          <Button label={save.isPending ? "Posting…" : mine.data ? "Update review" : "Post review"} icon="send" disabled={save.isPending} onPress={submit} />
          <Text style={styles.caption}>Posting shares your review with the PropperBrew community.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 56 },
    signedOut: { padding: GUTTER, gap: 16 },
    summary: { alignItems: "center", gap: 12 },
    bag: { width: 192, backgroundColor: c.surfaceContainerLowest, marginBottom: 12 },
    title: { fontFamily: fonts.headline, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: c.primary, textAlign: "center" },
    stats: { flexDirection: "row", gap: 32, marginTop: 8 },
    statValue: { fontFamily: fonts.title, fontSize: 16, color: c.onSurface },
    spaced: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    note: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.xl },
    noteOn: { backgroundColor: c.secondaryContainer },
    // Ghost border for suggestions not yet picked.
    noteOff: { borderWidth: 1, borderStyle: "dashed", borderColor: `${c.outlineVariant}AA` },
    noteText: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: c.onSurfaceVariant },
    noteTextOn: { color: c.onSecondaryContainer },
    addNote: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
    error: { fontFamily: fonts.label, fontSize: 13, color: c.error },
    caption: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: c.outline, textAlign: "center" },
  }),
);
