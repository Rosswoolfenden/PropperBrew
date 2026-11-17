"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ROASTER_REVIEW_MAX_BODY, RoasterReviewInput } from "@propperbrew/shared";
import { refreshRoasterPages } from "@/app/[roaster]/actions";
import { useSession, useTRPC } from "@/app/providers";

const SCORES = [
  { key: "traceability", title: "Traceability", hint: "Direct trade transparency and farm-level data.", low: "Opaque", high: "Direct" },
  { key: "shipping", title: "Shipping", hint: "Delivery speed and eco-conscious packaging.", low: "Poor", high: "Exceptional" },
] as const;
const MAX_NOTES = 8;

/** Stitch "Rate Roaster": the overall experience, traceability and shipping, a short narrative and the notes you found. */
export function RoasterReviewComposer({ roasterId, roasterSlug, roasterName }: { roasterId: string; roasterSlug: string; roasterName: string }) {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const mine = useQuery({ ...trpc.roasterReviews.mine.queryOptions({ roasterId }), enabled: !!session });
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [scores, setScores] = useState<{ traceability: number | null; shipping: number | null }>({ traceability: null, shipping: null });
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const save = useMutation(
    trpc.roasterReviews.upsert.mutationOptions({
      onSuccess: async () => {
        await refreshRoasterPages(roasterSlug);
        await mine.refetch();
        router.refresh();
        setOpen(false);
        setPosted(true);
      },
      onError: (err) => setError(err.message),
    }),
  );

  // Editing: start from what they said last time.
  useEffect(() => {
    if (!open || !mine.data) return;
    setRating(mine.data.rating);
    setScores({ traceability: mine.data.traceability, shipping: mine.data.shipping });
    setBody(mine.data.body ?? "");
    setNotes(mine.data.notes);
  }, [open, mine.data]);

  if (!ready) return null;
  if (!session) {
    return (
      <p className="muted">
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in</Link> to review {roasterName}.
      </p>
    );
  }
  if (!open) {
    return (
      <div className="review-cta">
        {posted && (
          <p className="alert alert-info" role="status">
            Thanks. Your review of {roasterName} is up.
          </p>
        )}
        <button type="button" className="button button-secondary" onClick={() => (setOpen(true), setPosted(false), setError(null))}>
          {mine.data ? `Edit your review of ${roasterName}` : `Review ${roasterName}`}
        </button>
      </div>
    );
  }

  const addNote = () => {
    const note = newNote.trim();
    if (note && notes.length < MAX_NOTES && !notes.some((n) => n.toLowerCase() === note.toLowerCase())) setNotes([...notes, note]);
    setNewNote("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rating === null) return setError("Choose an overall rating.");
    const input = RoasterReviewInput.safeParse({ roasterId, rating, ...scores, body, notes });
    if (!input.success) return setError("Check your review and try again.");
    setError(null);
    save.mutate(input.data);
  };

  return (
    <form className="review-form card" onSubmit={submit} aria-label={`Review ${roasterName}`} noValidate>
      <fieldset className="stars-input" aria-label="Overall experience">
        <legend className="eyebrow">Overall experience (required)</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={rating !== null && n <= rating ? "on" : undefined}>
            <input type="radio" name={`${id}-rating`} checked={rating === n} onChange={() => (setRating(n), setError(null))} />
            <span aria-hidden="true">★</span>
            <span className="visually-hidden">{n === 1 ? "1 star" : `${n} stars`}</span>
          </label>
        ))}
      </fieldset>

      {SCORES.map((s) => {
        const value = scores[s.key];
        return (
          <div key={s.key} className="score-card">
            <label htmlFor={`${id}-${s.key}`}>
              <strong>{s.title}</strong>
              <span className="muted">{s.hint}</span>
            </label>
            <input
              id={`${id}-${s.key}`}
              type="range"
              min={1}
              max={5}
              step={1}
              value={value ?? 3}
              aria-valuetext={value === null ? "Not rated" : `${value} of 5`}
              className={value === null ? "unset" : undefined}
              onChange={(e) => setScores((x) => ({ ...x, [s.key]: Number(e.target.value) }))}
            />
            <div className="score-scale">
              <span>{s.low}</span>
              <strong>{value === null ? "Not rated" : `${value.toFixed(1)} / 5.0`}</strong>
              <span>{s.high}</span>
            </div>
            {value !== null && (
              <button type="button" className="text-button" onClick={() => setScores((x) => ({ ...x, [s.key]: null }))}>
                Clear {s.title.toLowerCase()}
              </button>
            )}
          </div>
        );
      })}

      <label className="field">
        <span className="eyebrow">The narrative</span>
        <textarea
          rows={4}
          maxLength={ROASTER_REVIEW_MAX_BODY}
          placeholder="Describe your journey, from the unboxing to the final sip…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <span className="muted chars-left">{ROASTER_REVIEW_MAX_BODY - body.length} characters left</span>
      </label>

      <fieldset aria-label="Signature notes found">
        <legend className="eyebrow">Signature notes found</legend>
        <ul className="chips">
          {notes.map((n) => (
            <li key={n} className="chip">
              {n}{" "}
              <button type="button" className="chip-remove" aria-label={`Remove ${n}`} onClick={() => setNotes(notes.filter((x) => x !== n))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="add-note">
          <input
            aria-label="Add a note"
            placeholder="Dark chocolate"
            maxLength={40}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())}
          />
          <button type="button" className="button button-secondary button-sm" onClick={addNote} disabled={!newNote.trim() || notes.length >= MAX_NOTES}>
            Add note
          </button>
        </div>
      </fieldset>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="review-actions">
        <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={save.isPending}>
          {save.isPending ? "Sending…" : "Submit feedback"}
        </button>
      </div>
      <p className="muted italic">Your review helps the community discover better brew.</p>
    </form>
  );
}
