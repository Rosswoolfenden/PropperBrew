"use client";

import { useId, useState, type FormEvent } from "react";
import { BREW_METHOD_LABELS, BREW_METHODS, BrewLogInput, brewRatio, formatDuration, parseDuration, type BrewMethod } from "@propperbrew/shared";

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

/** Log or edit a brew. The website twin of the app's journal form. */
export function BrewForm({
  label,
  start,
  links,
  submitLabel,
  busy,
  serverError,
  onSubmit,
  onCancel,
}: {
  label: string;
  start: BrewStart | null;
  links: Pick<BrewLogInput, "coffeeBeanId" | "shelfEntryId" | "recipeId">;
  submitLabel: string;
  busy: boolean;
  serverError?: string;
  onSubmit: (input: BrewLogInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
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
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [key]: e.target.value }));
  const dose = num(f.dose);
  const water = num(f.water);

  const submit = (e: FormEvent) => {
    e.preventDefault();
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
  const err = (key: string) => errors[key] && <span className="field-error">{errors[key]}</span>;

  return (
    <form className="card business-form brew-form" onSubmit={submit} aria-label={label} noValidate>
      <div className="field">
        <label htmlFor={`${id}-method`} className="eyebrow">
          Method
        </label>
        <select id={`${id}-method`} value={method} onChange={(e) => setMethod(e.target.value as BrewMethod)}>
          {BREW_METHODS.map((m) => (
            <option key={m} value={m}>
              {BREW_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label className="field">
          <span className="eyebrow">Coffee (g)</span>
          <input inputMode="decimal" placeholder="15" value={f.dose} onChange={set("dose")} aria-invalid={!!errors.coffeeDoseG} />
          {err("coffeeDoseG")}
        </label>
        <label className="field">
          <span className="eyebrow">Water (g)</span>
          <input inputMode="decimal" placeholder="250" value={f.water} onChange={set("water")} aria-invalid={!!errors.waterWeightG} />
          {err("waterWeightG")}
        </label>
      </div>
      {dose && water && dose > 0 ? <p className="eyebrow brew-ratio">Ratio {brewRatio(dose, water)}</p> : null}
      <div className="form-row">
        <label className="field">
          <span className="eyebrow">Temperature (°C)</span>
          <input inputMode="decimal" placeholder="94" value={f.temp} onChange={set("temp")} aria-invalid={!!errors.waterTempC} />
          {err("waterTempC")}
        </label>
        <label className="field">
          <span className="eyebrow">Brew time</span>
          <input placeholder="2:45" value={f.time} onChange={set("time")} aria-invalid={!!errors.totalBrewTimeSeconds} />
          {err("totalBrewTimeSeconds")}
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span className="eyebrow">Grinder</span>
          <input placeholder="Comandante C40" value={f.grinder} onChange={set("grinder")} />
        </label>
        <label className="field">
          <span className="eyebrow">Grind</span>
          <input placeholder="22 clicks" value={f.grind} onChange={set("grind")} />
        </label>
      </div>
      <fieldset className="brew-rating" aria-label="How was it?">
        <legend className="eyebrow">How was it?</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={rating !== null && n <= rating ? "on" : undefined}>
            <input type="radio" name={`${id}-rating`} checked={rating === n} onChange={() => setRating(n)} />
            <span aria-hidden="true">★</span>
            <span className="visually-hidden">{n === 1 ? "1 star" : `${n} stars`}</span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span className="eyebrow">Notes</span>
        <textarea rows={3} maxLength={2000} placeholder="Sweeter than last time; try a touch finer." value={f.notes} onChange={set("notes")} />
      </label>
      {serverError && (
        <p className="alert alert-error" role="alert">
          {serverError}
        </p>
      )}
      <div className="review-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
