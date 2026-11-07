"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { BREW_METHOD_LABELS, BREW_METHODS, UserProfileInput, type BrewMethod } from "@propperbrew/shared";
import { useSession, useTRPC } from "@/app/providers";

const MESSAGES: Record<string, string> = {
  displayName: "Keep your name under 60 characters.",
  bio: "Keep your line under 160 characters.",
  defaultGrinder: "Keep the grinder under 80 characters.",
};

/** Whether the signed-in person is `username`. The page is rendered without knowing who's viewing. */
function useIsYou(username: string) {
  const { session } = useSession();
  const trpc = useTRPC();
  const me = useQuery({ ...trpc.me.get.queryOptions(), enabled: !!session });
  return { isYou: !!session && me.data?.username === username, me: me.data };
}

/** "Reviews" on someone's profile, "Your Reviews" on your own. */
export function OwnerHeading({ id, username, children }: { id: string; username: string; children: string }) {
  const { isYou } = useIsYou(username);
  return <h2 id={id}>{isYou ? `Your ${children}` : children}</h2>;
}

/** "Edit profile" on your own profile page. Renders nothing on anyone else's. */
export function ProfileEditor({ username }: { username: string }) {
  const { isYou, me } = useIsYou(username);
  const [open, setOpen] = useState(false);

  if (!isYou || !me) return null;
  if (!open) {
    return (
      <div className="profile-actions">
        <button type="button" className="button button-secondary button-sm" onClick={() => setOpen(true)}>
          Edit profile
        </button>
      </div>
    );
  }
  return <EditForm profile={me} onDone={() => setOpen(false)} />;
}

type Profile = { displayName: string | null; bio: string | null; defaultGrinder: string | null; defaultBrewMethod: BrewMethod | null };

function EditForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const id = useId();
  const [form, setForm] = useState({
    displayName: profile.displayName ?? "",
    bio: profile.bio ?? "",
    defaultGrinder: profile.defaultGrinder ?? "",
    defaultBrewMethod: profile.defaultBrewMethod ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation(
    trpc.me.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.me.pathKey() });
        router.refresh();
        onDone();
      },
    }),
  );

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = UserProfileInput.safeParse({ ...form, defaultBrewMethod: form.defaultBrewMethod || null });
    if (!result.success) {
      const found: Record<string, string> = {};
      for (const issue of result.error.issues) found[String(issue.path[0])] ??= MESSAGES[String(issue.path[0])] ?? issue.message;
      return setErrors(found);
    }
    setErrors({});
    save.mutate(result.data);
  };
  const err = (key: string) => errors[key] && <span className="field-error">{errors[key]}</span>;

  return (
    <form className="card business-form profile-form" onSubmit={submit} aria-label="Edit profile" noValidate>
      <label className="field">
        <span className="eyebrow">Name</span>
        <input value={form.displayName} onChange={set("displayName")} placeholder="How you'd like to be shown" aria-invalid={!!errors.displayName} />
        {err("displayName")}
      </label>
      <label className="field">
        <span className="eyebrow">About you</span>
        <input value={form.bio} onChange={set("bio")} placeholder="In search of the perfect Ethiopian heirloom." aria-invalid={!!errors.bio} />
        {err("bio")}
      </label>
      <div className="form-row">
        {/* Labelled by id: a wrapped <select> adds its chosen option to its name. */}
        <div className="field">
          <label htmlFor={`${id}-method`} className="eyebrow">
            Usual brew method
          </label>
          <select id={`${id}-method`} value={form.defaultBrewMethod} onChange={set("defaultBrewMethod")}>
            <option value="">None</option>
            {BREW_METHODS.map((m) => (
              <option key={m} value={m}>
                {BREW_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <label className="field">
          <span className="eyebrow">Grinder</span>
          <input value={form.defaultGrinder} onChange={set("defaultGrinder")} placeholder="Comandante C40" aria-invalid={!!errors.defaultGrinder} />
          {err("defaultGrinder")}
        </label>
      </div>
      {save.error && (
        <p className="alert alert-error" role="alert">
          {save.error.message}
        </p>
      )}
      <div className="review-actions">
        <button type="button" className="button button-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
