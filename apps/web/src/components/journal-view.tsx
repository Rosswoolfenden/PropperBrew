"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { BREW_METHOD_LABELS, brewRatio, formatDuration } from "@propperbrew/shared";
import { useTRPC } from "@/app/providers";
import type { RouterOutputs } from "@/lib/trpc";
import { BrewForm, type BrewStart } from "./brew-form";
import { Stars } from "./rating";

type Brew = RouterOutputs["brews"]["list"]["brews"][number];
type Editing =
  | { mode: "new"; beanId: string; beanName: string; shelfEntryId?: string; again?: Brew }
  | { mode: "edit"; brew: Brew }
  | null;

const REST_LABEL = { resting: "Resting", peak: "At its peak", past_peak: "Past peak" } as const;
const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Your shelf (bags, where they are in their rest) and your brews: log, change, repeat or delete them. */
export function JournalView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const shelf = useQuery(trpc.shelf.list.queryOptions());
  const journal = useQuery(trpc.brews.list.queryOptions());
  const [editing, setEditing] = useState<Editing>(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: trpc.brews.pathKey() }), queryClient.invalidateQueries({ queryKey: trpc.shelf.pathKey() })]);
  const finish = useMutation(trpc.shelf.finish.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.brews.delete.mutationOptions({ onSuccess: refresh }));

  if (shelf.isPending || journal.isPending) return <p className="muted">Loading your journal…</p>;
  if (shelf.error || journal.error) return <p className="alert alert-error">We couldn&apos;t load your journal. Refresh to try again.</p>;
  const { brews, stats } = journal.data;

  return (
    <div className="journal">
      <dl className="profile-stats journal-stats">
        {[
          { label: "This week", value: stats.thisWeek },
          { label: stats.total === 1 ? "Brew" : "Brews", value: stats.total },
          { label: "Favourite", value: stats.favouriteMethod ? BREW_METHOD_LABELS[stats.favouriteMethod] : "—" },
        ].map((s) => (
          <div key={s.label}>
            <dt className="eyebrow">{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>

      {editing && <Editor editing={editing} onDone={() => setEditing(null)} />}

      <section aria-labelledby="shelf-heading">
        <h2 id="shelf-heading">On your shelf</h2>
        {shelf.data.length === 0 ? (
          <p className="note">Nothing on your shelf. Add a bag from any coffee&apos;s page.</p>
        ) : (
          <ul className="shelf-list">
            {shelf.data.map((e) => (
              <li key={e.id} className="shelf-entry">
                <div className="frame frame-contain">{e.bean.imageUrl && <img src={e.bean.imageUrl} alt="" />}</div>
                <div className="shelf-entry-body">
                  {e.rest && <span className="eyebrow rest-state">{REST_LABEL[e.rest.state]}</span>}
                  <h3>
                    <Link href={`/${e.bean.roaster.slug}/${e.bean.slug}`}>{e.bean.name}</Link>
                  </h3>
                  <p className="muted">
                    {e.bean.roaster.name}
                    {e.rest ? ` · Day ${e.rest.daysSinceRoast} post-roast` : " · No roast date"}
                    {e.brewCount > 0 ? ` · ${e.brewCount === 1 ? "1 brew" : `${e.brewCount} brews`}` : ""}
                  </p>
                  <div className="shelf-actions">
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => setEditing({ mode: "new", beanId: e.bean.id, beanName: e.bean.name, shelfEntryId: e.id })}
                    >
                      Log a brew
                    </button>
                    <button type="button" className="text-button" aria-label={`Finished ${e.bean.name}`} disabled={finish.isPending} onClick={() => finish.mutate({ id: e.id })}>
                      Finished it
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="brews-heading">
        <h2 id="brews-heading">Recent brews</h2>
        {brews.length === 0 ? (
          <p className="note">No brews yet. Log one from a bag on your shelf.</p>
        ) : (
          <ul className="brew-list">
            {brews.map((b) => (
              <li key={b.id} className="brew-entry" aria-label={`${BREW_METHOD_LABELS[b.brewMethod]}, ${b.bean.name}, ${when.format(b.brewedAt)}`}>
                <div className="brew-head">
                  <strong>{BREW_METHOD_LABELS[b.brewMethod]}</strong>
                  <span className="eyebrow">{when.format(b.brewedAt)}</span>
                </div>
                <Link href={`/${b.bean.roaster.slug}/${b.bean.slug}`}>{b.bean.name}</Link>
                <p className="muted">
                  {[
                    `${b.coffeeDoseG}g → ${b.waterWeightG}g (${brewRatio(b.coffeeDoseG, b.waterWeightG)})`,
                    b.waterTempC ? `${b.waterTempC}°C` : null,
                    b.totalBrewTimeSeconds ? formatDuration(b.totalBrewTimeSeconds) : null,
                    [b.grinderModel, b.grindSetting].filter(Boolean).join(" @ ") || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {b.rating ? <Stars value={b.rating} /> : null}
                {b.notes && <p className="italic">{b.notes}</p>}
                <div className="shelf-actions">
                  <button type="button" className="text-button" onClick={() => setEditing({ mode: "edit", brew: b })}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setEditing({ mode: "new", beanId: b.coffeeBeanId, beanName: b.bean.name, shelfEntryId: b.shelfEntryId ?? undefined, again: b })}
                  >
                    Brew again
                  </button>
                  <button type="button" className="text-button" disabled={remove.isPending} onClick={() => remove.mutate({ id: b.id })}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The form, starting from the brew being edited, the brew being repeated, or their last brew of this coffee. */
function Editor({ editing, onDone }: { editing: NonNullable<Editing>; onDone: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: trpc.brews.pathKey() }), queryClient.invalidateQueries({ queryKey: trpc.shelf.pathKey() })]);
  const create = useMutation(trpc.brews.create.mutationOptions({ onSuccess: async () => (await refresh(), onDone()) }));
  const update = useMutation(trpc.brews.update.mutationOptions({ onSuccess: async () => (await refresh(), onDone()) }));
  const fresh = editing.mode === "new" && !editing.again;
  const startingPoint = useQuery({
    ...trpc.brews.startingPoint.queryOptions({ coffeeBeanId: editing.mode === "new" ? editing.beanId : editing.brew.coffeeBeanId }),
    enabled: fresh,
  });
  if (fresh && startingPoint.isPending) return <p className="muted">One moment…</p>;

  if (editing.mode === "edit") {
    const b = editing.brew;
    return (
      <BrewForm
        key={b.id}
        label={`Edit brew of ${b.bean.name}`}
        start={b}
        links={{ coffeeBeanId: b.coffeeBeanId, shelfEntryId: b.shelfEntryId, recipeId: b.recipeId }}
        submitLabel="Save changes"
        busy={update.isPending}
        serverError={update.error?.message}
        onSubmit={(input) => update.mutate({ ...input, id: b.id })}
        onCancel={onDone}
      />
    );
  }
  const start: BrewStart | null = editing.again ? { ...editing.again, rating: null, notes: null } : (startingPoint.data ?? null);
  return (
    <div className="stack">
      <p className="muted">
        Logging a brew of <strong>{editing.beanName}</strong>
        {editing.again ? ", starting from that brew." : startingPoint.data ? ", starting from your last one." : "."}
      </p>
      <BrewForm
        key={`${editing.beanId}-${editing.again?.id ?? "new"}`}
        label={`Log a brew of ${editing.beanName}`}
        start={start}
        links={{ coffeeBeanId: editing.beanId, shelfEntryId: editing.shelfEntryId ?? null, recipeId: editing.again?.recipeId ?? null }}
        submitLabel="Save brew"
        busy={create.isPending}
        serverError={create.error?.message}
        onSubmit={(input) => create.mutate(input)}
        onCancel={onDone}
      />
    </div>
  );
}
