"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { RoasterProfileInput } from "@propperbrew/shared";
import { refreshRoasterPages } from "@/app/[roaster]/actions";
import { useTRPC } from "@/app/providers";
import { PhotoPicker } from "../photo-picker";
import type { RouterOutputs } from "@/lib/trpc";

type Roaster = RouterOutputs["business"]["me"]["roasters"][number];

const MESSAGES: Record<string, string> = {
  tagline: "Keep your philosophy under 280 characters.",
  bio: "Keep your story under 2,000 characters.",
  establishedYear: `Enter a year between 1800 and ${new Date().getFullYear()}.`,
  websiteUrl: "Enter your full website address, starting https://",
  city: "Keep the city under 80 characters.",
  address: "Keep the address under 200 characters.",
};

/** The roaster's public page details (Stitch "Roaster Profile"). */
export function ProfileForm({ roaster }: { roaster: Roaster }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    tagline: roaster.tagline ?? "",
    bio: roaster.bio ?? "",
    city: roaster.city ?? "",
    establishedYear: roaster.establishedYear ? String(roaster.establishedYear) : "",
    address: roaster.address ?? "",
    websiteUrl: roaster.websiteUrl ?? "",
    heroImageUrl: roaster.heroImageUrl,
    logoUrl: roaster.logoUrl,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const photos = [...new Set(roaster.coffees.flatMap((c) => (c.imageUrl ? [c.imageUrl] : [])))];

  const save = useMutation(
    trpc.business.updateProfile.mutationOptions({
      onSuccess: async () => {
        await refreshRoasterPages(roaster.slug);
        await queryClient.invalidateQueries({ queryKey: trpc.business.pathKey() });
        setSaved(true);
      },
    }),
  );

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const year = form.establishedYear.trim();
    const result = RoasterProfileInput.safeParse({
      roasterId: roaster.id,
      ...form,
      establishedYear: year ? Number(year) : null,
    });
    if (!result.success) {
      const found: Record<string, string> = {};
      for (const issue of result.error.issues) found[String(issue.path[0])] ??= MESSAGES[String(issue.path[0])] ?? issue.message;
      return setErrors(found);
    }
    setErrors({});
    save.mutate(result.data);
  };

  const field = (key: keyof typeof MESSAGES, label: string, input: React.ReactNode) => (
    <label className="field">
      <span className="eyebrow">{label}</span>
      {input}
      {errors[key] && <span className="field-error">{errors[key]}</span>}
    </label>
  );

  return (
    <form className="card business-form" onSubmit={submit} aria-label="Your page" noValidate>
      <div className="card-head">
        <h3>Your page</h3>
        <a href={`/${roaster.slug}`} className="rule-link" target="_blank" rel="noopener">
          View your page
        </a>
      </div>
      {field("tagline", "Philosophy", <textarea rows={2} maxLength={280} placeholder="Roasted light, so you taste the farm." value={form.tagline} onChange={set("tagline")} aria-invalid={!!errors.tagline} />)}
      {field("bio", "Your story", <textarea rows={5} maxLength={2000} placeholder="Who you are, where you source, how you roast." value={form.bio} onChange={set("bio")} aria-invalid={!!errors.bio} />)}
      <div className="form-row">
        {field("city", "City", <input value={form.city} onChange={set("city")} placeholder="Leeds" aria-invalid={!!errors.city} />)}
        {field("establishedYear", "Established", <input inputMode="numeric" value={form.establishedYear} onChange={set("establishedYear")} placeholder="2016" aria-invalid={!!errors.establishedYear} />)}
      </div>
      {field("address", "Roastery address", <input value={form.address} onChange={set("address")} placeholder="12 Call Lane, Leeds" aria-invalid={!!errors.address} />)}
      {field("websiteUrl", "Website", <input type="url" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="https://your-roastery.co.uk" aria-invalid={!!errors.websiteUrl} />)}

      <PhotoPicker kind="logo" label="Logo" value={form.logoUrl} onChange={(logoUrl) => (setForm((f) => ({ ...f, logoUrl })), setSaved(false))} />

      <fieldset className="hero-picker">
        <legend className="eyebrow">Hero photo</legend>
        {photos.length === 0 ? (
          <p className="muted">Your coffee photos appear here once your products sync.</p>
        ) : (
          <div className="hero-options">
            {photos.map((url, i) => (
              <label key={url} className={form.heroImageUrl === url ? "on" : undefined}>
                <input type="radio" name="hero" checked={form.heroImageUrl === url} onChange={() => (setForm((f) => ({ ...f, heroImageUrl: url })), setSaved(false))} />
                <img src={url} alt={`Coffee photo ${i + 1}`} />
              </label>
            ))}
            <label className={form.heroImageUrl === null ? "on hero-none" : "hero-none"}>
              <input type="radio" name="hero" checked={form.heroImageUrl === null} onChange={() => (setForm((f) => ({ ...f, heroImageUrl: null })), setSaved(false))} />
              None
            </label>
          </div>
        )}
      </fieldset>

      {save.error && (
        <p className="alert alert-error" role="alert">
          {save.error.message}
        </p>
      )}
      {saved && (
        <p className="alert alert-info" role="status">
          Saved. Your page is up to date.
        </p>
      )}
      <button type="submit" className="button" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save your page"}
      </button>
    </form>
  );
}
