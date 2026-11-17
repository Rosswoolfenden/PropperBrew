import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { radius, ROASTER_REVIEW_MAX_BODY, RoasterReviewInput } from "@propperbrew/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScoreSlider, StarRating } from "@/review-inputs";
import { useSession } from "@/session";
import { fonts, themed, useColors } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Eyebrow, Field, GUTTER, Loading } from "@/ui";

const MAX_NOTES = 8;

/** Stitch "Rate Roaster": overall experience, traceability, shipping, the narrative and the notes found. */
export default function RoasterReviewScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const styles = useStyles();
  const colors = useColors();
  const { session, ready } = useSession();
  const roaster = useQuery(trpc.roasters.bySlug.queryOptions({ slug }));
  const mine = useQuery({ ...trpc.roasterReviews.mine.queryOptions({ roasterId: roaster.data?.id ?? "" }), enabled: !!roaster.data && !!session });
  const [rating, setRating] = useState<number | null>(null);
  const [traceability, setTraceability] = useState<number | null>(null);
  const [shipping, setShipping] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Editing: start from what they said last time (once).
  useEffect(() => {
    if (loaded || mine.isPending) return;
    if (mine.data) {
      setRating(mine.data.rating);
      setTraceability(mine.data.traceability);
      setShipping(mine.data.shipping);
      setBody(mine.data.body ?? "");
      setNotes(mine.data.notes);
    }
    setLoaded(true);
  }, [loaded, mine.isPending, mine.data]);

  const save = useMutation(
    trpc.roasterReviews.upsert.mutationOptions({
      onSuccess: async () => {
        await Promise.all([queryClient.invalidateQueries({ queryKey: trpc.roasterReviews.pathKey() }), queryClient.invalidateQueries({ queryKey: trpc.users.pathKey() })]);
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: "/roaster/[slug]", params: { slug } });
      },
      onError: (err) => setError(err.message),
    }),
  );

  if (!ready || roaster.isPending || (session && roaster.data && !loaded)) return <Loading />;
  if (!roaster.data) return <Body style={{ padding: GUTTER }}>Roaster not found.</Body>;
  const r = roaster.data;

  const addNote = () => {
    const note = newNote.trim();
    if (note && notes.length < MAX_NOTES && !notes.some((n) => n.toLowerCase() === note.toLowerCase())) setNotes([...notes, note]);
    setNewNote("");
  };
  const submit = () => {
    if (rating === null) return setError("Choose an overall rating.");
    const input = RoasterReviewInput.safeParse({ roasterId: r.id, rating, traceability, shipping, body, notes });
    if (!input.success) return setError("Check your review and try again.");
    setError(null);
    save.mutate(input.data);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.head}>
        {r.logoUrl ? (
          <View style={styles.logoCard}>
            <Image source={{ uri: r.logoUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel={`${r.name} logo`} />
          </View>
        ) : null}
        <Eyebrow>Reviewing roaster</Eyebrow>
        <Text role="heading" style={styles.name}>
          {r.name}
        </Text>
        {r.tagline ? (
          <Body italic muted style={styles.center}>
            {r.tagline}
          </Body>
        ) : null}
      </View>

      <View style={{ gap: 12 }}>
        <View style={styles.spaced}>
          <Eyebrow>Overall experience</Eyebrow>
          <Body italic muted style={{ fontSize: 14 }}>
            Required
          </Body>
        </View>
        <StarRating value={rating} onChange={(n) => (setRating(n), setError(null))} />
      </View>

      <View style={styles.card}>
        <ScoreSlider label="Traceability" hint="Direct trade transparency and farm-level data." low="Opaque" high="Direct" value={traceability} onChange={setTraceability} />
      </View>
      <View style={styles.card}>
        <ScoreSlider label="Shipping" hint="Delivery speed and eco-conscious packaging." low="Poor" high="Exceptional" value={shipping} onChange={setShipping} />
      </View>

      <View style={{ gap: 6 }}>
        <Field
          label="The narrative"
          placeholder="Describe your journey, from the unboxing to the final sip…"
          multiline
          maxLength={ROASTER_REVIEW_MAX_BODY}
          value={body}
          onChangeText={setBody}
          style={{ minHeight: 140, textAlignVertical: "top" }}
        />
        <Text style={styles.left}>{ROASTER_REVIEW_MAX_BODY - body.length} characters left</Text>
      </View>

      <View role="group" aria-label="Signature notes found" style={{ gap: 12 }}>
        <Eyebrow>Signature notes found</Eyebrow>
        <View style={styles.chips}>
          {notes.map((n) => (
            <Pressable key={n} role="button" aria-label={`Remove ${n}`} onPress={() => setNotes(notes.filter((x) => x !== n))} style={styles.chip}>
              <Text style={styles.chipText}>{n} ×</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.addRow}>
          <View style={{ flex: 1 }}>
            <Field label="Add a note" placeholder="Stone fruit" value={newNote} onChangeText={setNewNote} onSubmitEditing={addNote} returnKeyType="done" maxLength={40} />
          </View>
          <Button label="Add" variant="secondary" disabled={!newNote.trim() || notes.length >= MAX_NOTES} onPress={addNote} />
        </View>
      </View>

      {error && (
        <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
          {error}
        </Text>
      )}
      <Button label={save.isPending ? "Sending…" : "Submit feedback"} disabled={save.isPending} onPress={submit} />
      <Body italic muted style={styles.center}>
        Your review helps the community discover better brew.
      </Body>
    </ScrollView>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { padding: GUTTER, paddingBottom: 64, gap: 32 },
    head: { alignItems: "center", gap: 8 },
    logoCard: { padding: 14, borderRadius: radius.xl, backgroundColor: "#fff", marginBottom: 8 },
    logo: { width: 72, height: 72 },
    name: { fontFamily: fonts.headline, fontSize: 34, lineHeight: 38, letterSpacing: -1, textAlign: "center", color: c.primary },
    center: { textAlign: "center" },
    spaced: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    card: { padding: 22, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    left: { alignSelf: "flex-end", fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: c.outline },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.secondaryContainer },
    chipText: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: c.onSecondaryContainer },
    addRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  }),
);
