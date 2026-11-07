"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent } from "react";
import { BREW_METHOD_LABELS, BREW_METHODS, brewRatio, CreateBrewRecipeInput, parseDuration, type BrewMethod } from "@propperbrew/shared";
import { refreshRoasterPages } from "@/app/[roaster]/actions";
import { useTRPC } from "@/app/providers";
import type { RouterOutputs } from "@/lib/trpc";

type Roaster = RouterOutputs["business"]["me"]["roasters"][number];
type StepDraft = { key: number; time: string; water: string; title: string; note: string };

const MESSAGES: Record<string, string> = {
  coffeeDoseG: "Enter a dose up to 100g",
  waterWeightG: "Enter up to 5,000g of water",
  waterTempC: "Enter a temperature between 0 and 100°C",
  totalBrewTimeSeconds: "Enter a time like 2:45",
  steps: "Steps need to be in time order",
};
const optionalNumber = (text: string) => (text.trim() === "" ? undefined : Number(text.replace(",", ".")));
const optionalText = (text: string) => text.trim() || undefined;

/** The roaster's own recommended recipes ("Roaster's pick"): list, remove, and add. */
export function Recommendations({ roaster }: { roaster: Roaster }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = async (beanSlug: string) => {
    await refreshRoasterPages(roaster.slug, beanSlug);
    await queryClient.invalidateQueries({ queryKey: trpc.business.pathKey() });
  };
  const remove = useMutation(trpc.business.deleteRecommendation.mutationOptions());

  return (
    <section className="card business-form" aria-label="Your recommendations">
      <div className="card-head">
        <h3>Your recommendations</h3>
      </div>
      <p className="muted">Recipes you recommend show first on your coffees as &ldquo;Roaster&apos;s pick&rdquo;.</p>
      {roaster.recommendations.length === 0 ? (
        <p className="note">No recommendations yet.</p>
      ) : (
        <ul className="rec-list">
          {roaster.recommendations.map((r) => (
            <li key={r.id} className="rec-line">
              <div>
                <strong>{BREW_METHOD_LABELS[r.brewMethod]}</strong>
                <span className="muted"> for {r.bean.name}</span>
                <div className="muted">
                  {r.coffeeDoseG}g → {r.waterWeightG}g ({brewRatio(r.coffeeDoseG, r.waterWeightG)})
                  {r.waterTempC ? ` · ${r.waterTempC}°C` : ""} · ↑ {r.upvotesCount}
                </div>
              </div>
              <button
                type="button"
                className="text-button"
                aria-label={`Remove ${BREW_METHOD_LABELS[r.brewMethod]} for ${r.bean.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ recipeId: r.id }, { onSuccess: () => refresh(r.bean.slug) })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {roaster.coffees.some((c) => c.status !== "archived") && <NewRecommendation roaster={roaster} onAdded={refresh} />}
    </section>
  );
}

function NewRecommendation({ roaster, onAdded }: { roaster: Roaster; onAdded: (beanSlug: string) => Promise<void> }) {
  const trpc = useTRPC();
  const coffees = roaster.coffees.filter((c) => c.status !== "archived");
  const [beanId, setBeanId] = useState(coffees[0]!.id);
  const [method, setMethod] = useState<BrewMethod>("v60");
  const [f, setF] = useState({ dose: "", water: "", temp: "", time: "", grind: "", notes: "" });
  const nextKey = useRef(1);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);
  const idBase = useId();

  const add = useMutation(
    trpc.business.addRecommendation.mutationOptions({
      onSuccess: async () => {
        await onAdded(coffees.find((c) => c.id === beanId)!.slug);
        setF({ dose: "", water: "", temp: "", time: "", grind: "", notes: "" });
        setSteps([]);
        setAdded(true);
      },
    }),
  );

  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => (setF((x) => ({ ...x, [key]: e.target.value })), setAdded(false));
  const updateStep = (key: number, patch: Partial<StepDraft>) => setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!f.dose.trim()) found.coffeeDoseG = "Enter the coffee dose";
    if (!f.water.trim()) found.waterWeightG = "Enter the total water";
    const parsedSteps = steps.map((s, i) => {
      const at = parseDuration(s.time);
      if (at === null) found[`steps.${i}.time`] = "Enter a time like 0:30";
      return { time: at ?? 0, water: optionalNumber(s.water), title: optionalText(s.title), note: optionalText(s.note) };
    });
    const result = CreateBrewRecipeInput.safeParse({
      coffeeBeanId: beanId,
      brewMethod: method,
      coffeeDoseG: optionalNumber(f.dose) ?? NaN,
      waterWeightG: optionalNumber(f.water) ?? NaN,
      waterTempC: optionalNumber(f.temp),
      grindSetting: optionalText(f.grind),
      totalBrewTimeSeconds: f.time.trim() ? (parseDuration(f.time) ?? NaN) : undefined,
      steps: parsedSteps,
      notes: optionalText(f.notes),
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        found[path] ??= MESSAGES[path] ?? (path.endsWith(".water") ? "Enter grams of water" : "Check this value");
      }
    }
    setErrors(found);
    if (result.success && Object.keys(found).length === 0) add.mutate(result.data);
  };

  const err = (key: string) => errors[key] && <span className="field-error">{errors[key]}</span>;
  return (
    <form className="rec-form" onSubmit={submit} aria-label="New recommendation" noValidate>
      <h4>Recommend a recipe</h4>
      <div className="form-row">
        {/* Labelled by id, not by wrapping: a wrapped <select> adds its chosen option to its name. */}
        <div className="field">
          <label htmlFor={`${idBase}-coffee`} className="eyebrow">
            Coffee
          </label>
          <select id={`${idBase}-coffee`} value={beanId} onChange={(e) => setBeanId(e.target.value)}>
            {coffees.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-method`} className="eyebrow">
            Brew method
          </label>
          <select id={`${idBase}-method`} value={method} onChange={(e) => setMethod(e.target.value as BrewMethod)}>
            {BREW_METHODS.map((m) => (
              <option key={m} value={m}>
                {BREW_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <label className="field">
          <span className="eyebrow">Coffee dose (g)</span>
          <input inputMode="decimal" placeholder="15" value={f.dose} onChange={set("dose")} aria-invalid={!!errors.coffeeDoseG} />
          {err("coffeeDoseG")}
        </label>
        <label className="field">
          <span className="eyebrow">Total water (g)</span>
          <input inputMode="decimal" placeholder="250" value={f.water} onChange={set("water")} aria-invalid={!!errors.waterWeightG} />
          {err("waterWeightG")}
        </label>
      </div>
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
        <label className="field">
          <span className="eyebrow">Grind</span>
          <input placeholder="Medium-fine" value={f.grind} onChange={set("grind")} />
        </label>
      </div>
      <label className="field">
        <span className="eyebrow">Why it works</span>
        <textarea rows={3} maxLength={2000} placeholder="How you dial it in at the roastery." value={f.notes} onChange={set("notes")} />
      </label>

      <fieldset className="rec-steps">
        <legend className="eyebrow">Steps (optional)</legend>
        {errors.steps && <span className="field-error">{errors.steps}</span>}
        {steps.map((s, i) => (
          <div key={s.key} className="rec-step">
            <span className="rec-step-number">{String(i + 1).padStart(2, "0")}</span>
            <label className="field">
              <span className="eyebrow">Step {i + 1} title</span>
              <input placeholder="The bloom" value={s.title} onChange={(e) => updateStep(s.key, { title: e.target.value })} />
            </label>
            <label className="field">
              <span className="eyebrow">Step {i + 1} starts at</span>
              <input placeholder="0:00" value={s.time} onChange={(e) => updateStep(s.key, { time: e.target.value })} aria-invalid={!!errors[`steps.${i}.time`]} />
              {err(`steps.${i}.time`)}
            </label>
            <label className="field">
              <span className="eyebrow">Step {i + 1} water to (g)</span>
              <input inputMode="decimal" placeholder="50" value={s.water} onChange={(e) => updateStep(s.key, { water: e.target.value })} />
              {err(`steps.${i}.water`)}
            </label>
            <label className="field rec-step-note">
              <span className="eyebrow">Step {i + 1} instructions</span>
              <input placeholder="Saturate the grounds evenly." value={s.note} onChange={(e) => updateStep(s.key, { note: e.target.value })} />
            </label>
            <button type="button" className="text-button" onClick={() => setSteps((all) => all.filter((x) => x.key !== s.key))}>
              Remove step
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button button-secondary button-sm"
          onClick={() => setSteps((all) => [...all, { key: nextKey.current++, time: "", water: "", title: "", note: "" }])}
        >
          Add step
        </button>
      </fieldset>

      {add.error && (
        <p className="alert alert-error" role="alert">
          {add.error.message}
        </p>
      )}
      {added && (
        <p className="alert alert-info" role="status">
          Posted. It shows first on that coffee&apos;s brewing guide.
        </p>
      )}
      <button type="submit" className="button" disabled={add.isPending}>
        {add.isPending ? "Posting…" : "Post recommendation"}
      </button>
    </form>
  );
}
