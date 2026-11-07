"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CreateReviewInput, SENSORY, SENSORY_DIMENSIONS, sensoryLevel, type FlavourScores } from "@propperbrew/shared";
import { refreshCoffeePage } from "@/app/[roaster]/[bean]/actions";
import { useSession, useTRPC } from "@/app/providers";

const MAX_NOTES = 12;

/** "Write a review" on a coffee page: stars, sensory profile, tasting notes and notes. */
export function ReviewComposer({
  coffeeBeanId,
  roasterSlug,
  beanSlug,
  suggestedNotes,
}: {
  coffeeBeanId: string;
  roasterSlug: string;
  beanSlug: string;
  suggestedNotes: string[];
}) {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mine = useQuery({ ...trpc.reviews.mine.queryOptions({ coffeeBeanId }), enabled: !!session });

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [scores, setScores] = useState<FlavourScores>({});
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  // Editing: start from their existing review.
  useEffect(() => {
    if (!open || !mine.data) return;
    setRating(Math.round(mine.data.rating));
    setScores(mine.data.flavourScores ?? {});
    setNotes(mine.data.tastingNotes);
    setBody(mine.data.body ?? "");
  }, [open, mine.data]);

  const save = useMutation(
    trpc.reviews.upsert.mutationOptions({
      onSuccess: async () => {
        await refreshCoffeePage(roasterSlug, beanSlug);
        queryClient.invalidateQueries({ queryKey: trpc.reviews.pathKey() });
        router.refresh();
        setOpen(false);
        setPosted(true);
      },
      onError: () => setError("Couldn't post your review. Please try again."),
    }),
  );

  if (!ready) return null;
  if (!session) {
    return (
      <p className="muted">
        <Link href={`/sign-in?next=/${roasterSlug}/${beanSlug}`}>Sign in</Link> to rate this coffee and share your tasting notes.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="review-cta">
        {posted && (
          <p className="alert alert-info" role="status">
            Thanks, your review is posted.
          </p>
        )}
        <button type="button" className="button button-secondary" onClick={() => (setOpen(true), setPosted(false))}>
          {mine.data ? "Edit your review" : "Write a review"}
        </button>
      </div>
    );
  }

  const suggestions = [...new Set([...suggestedNotes, ...notes])];
  const toggleNote = (note: string) =>
    setNotes((all) => (all.includes(note) ? all.filter((n) => n !== note) : all.length < MAX_NOTES ? [...all, note] : all));
  const addNote = () => {
    const note = newNote.trim();
    if (note && !notes.some((n) => n.toLowerCase() === note.toLowerCase())) toggleNote(note);
    setNewNote("");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rating === null) return setError("Choose a star rating.");
    const input = CreateReviewInput.safeParse({ coffeeBeanId, rating, tastingNotes: notes, body: body.trim() || undefined, flavourScores: scores });
    if (!input.success) return setError("Check your review and try again.");
    setError(null);
    save.mutate(input.data);
  };

  return (
    <form className="review-form card" onSubmit={submit} aria-label="Your review">
      <fieldset className="stars-input">
        <legend className="eyebrow">Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={rating !== null && n <= rating ? "on" : undefined}>
            <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => (setRating(n), setError(null))} />
            <span aria-hidden>★</span>
            <span className="visually-hidden">
              {n} {n === 1 ? "star" : "stars"}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="sensory-inputs">
        <h3>Sensory Profile</h3>
        <p className="muted">Calibrate the characteristics of this roast based on your brew. Leave any you&apos;re unsure of.</p>
        {SENSORY_DIMENSIONS.map((d) => (
          // Named by its dimension alone; the legend also shows the current level.
          <fieldset key={d} className="sensory-input" aria-label={SENSORY[d].label}>
            <legend className="sensory-head">
              <span className="sensory-label">{SENSORY[d].label}</span>
              <span className="muted italic">{scores[d] ? sensoryLevel(d, scores[d]) : "Not rated"}</span>
            </legend>
            <div className="sensory-track">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={scores[d] === n ? "on" : undefined}>
                  <input
                    type="radio"
                    name={d}
                    value={n}
                    checked={scores[d] === n}
                    // Clicking the chosen stop again clears it: every dimension is optional.
                    onClick={() => scores[d] === n && setScores((s) => ({ ...s, [d]: undefined }))}
                    onChange={() => setScores((s) => ({ ...s, [d]: n }))}
                  />
                  <span className="visually-hidden">
                    {SENSORY[d].label} {n} of 5, {sensoryLevel(d, n)}
                  </span>
                </label>
              ))}
            </div>
            <div className="sensory-ends">
              <span>{SENSORY[d].low}</span>
              <span>{SENSORY[d].high}</span>
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset className="notes-input">
        <legend className="eyebrow">Tasting notes</legend>
        <div className="chips">
          {suggestions.map((n) => (
            <label key={n} className={`note-chip${notes.includes(n) ? " on" : ""}`}>
              <input type="checkbox" checked={notes.includes(n)} onChange={() => toggleNote(n)} />
              {n}
            </label>
          ))}
        </div>
        <div className="add-note">
          <label className="field">
            <span className="eyebrow">Add a note</span>
            <input
              placeholder="Stone fruit"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())}
            />
          </label>
          <button type="button" className="button button-secondary button-sm" onClick={addNote} disabled={!newNote.trim() || notes.length >= MAX_NOTES}>
            Add
          </button>
        </div>
      </fieldset>

      <label className="field">
        <span className="eyebrow">Editorial notes</span>
        <textarea
          rows={5}
          maxLength={4000}
          placeholder="Describe the aroma, the first sip, and how it evolves as it cools…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="review-actions">
        <button type="submit" className="button" disabled={save.isPending}>
          {save.isPending ? "Posting…" : mine.data ? "Update review" : "Post review"}
        </button>
        <button type="button" className="text-button" onClick={() => (setOpen(false), setError(null))}>
          Cancel
        </button>
      </div>
    </form>
  );
}
