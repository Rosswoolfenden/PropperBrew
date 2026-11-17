"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession, useTRPC } from "@/app/providers";

/** Put a bag of this coffee on your shelf, with its roast date so we can tell you when it's at its best. */
export function AddToShelf({ coffeeBeanId, name }: { coffeeBeanId: string; name: string }) {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const pathname = usePathname();
  const [roastDate, setRoastDate] = useState("");
  const add = useMutation(trpc.shelf.add.mutationOptions());
  const today = new Date().toISOString().slice(0, 10);

  if (!ready) return null;
  if (!session) {
    return (
      <p className="muted">
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in</Link> to keep this coffee on your shelf and log your brews.
      </p>
    );
  }
  if (add.isSuccess) {
    return (
      <p className="alert alert-info" role="status">
        {name} is on your shelf. <Link href="/journal">Log a brew in your journal</Link>.
      </p>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ coffeeBeanId, roastDate: roastDate || undefined });
  };
  return (
    <form className="add-to-shelf" onSubmit={submit} aria-label="Add to your shelf">
      <label className="field">
        <span className="eyebrow">Roast date (on the bag)</span>
        <input type="date" max={today} value={roastDate} onChange={(e) => setRoastDate(e.target.value)} />
      </label>
      <button type="submit" className="button button-secondary" disabled={add.isPending}>
        {add.isPending ? "Adding…" : "Add to my shelf"}
      </button>
      {add.error && (
        <p className="alert alert-error" role="alert">
          {add.error.message}
        </p>
      )}
    </form>
  );
}
