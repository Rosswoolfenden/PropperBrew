"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { REPORT_REASON_LABELS, REPORT_REASONS, type ReportTarget } from "@propperbrew/shared";
import { useSession, useTRPC } from "@/app/providers";

/**
 * "Report" on a review, recipe or profile: pick a reason, add a note if you like, and a person
 * looks at it. Not shown on your own posts.
 */
export function ReportButton({
  targetType,
  targetId,
  what,
  ownerUsername,
}: {
  targetType: ReportTarget;
  targetId: string;
  /** For screen readers: "alice's review", "this recipe"… */
  what: string;
  ownerUsername?: string | null;
}) {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const pathname = usePathname();
  const me = useQuery({ ...trpc.me.get.queryOptions(), enabled: !!session });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const id = useId();
  const report = useMutation(trpc.reports.create.mutationOptions());

  if (!ready || (ownerUsername && me.data?.username === ownerUsername)) return null;
  if (report.isSuccess) {
    return (
      <p className="report-done muted" role="status">
        Thanks for telling us. We&apos;ll take a look.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="text-button report-button" aria-label={`Report ${what}`} onClick={() => setOpen(true)}>
        Report
      </button>
    );
  }
  if (!session) {
    return (
      <p className="report-done muted">
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in</Link> to report {what}.
      </p>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!reason) return setMissing(true);
    report.mutate({ targetType, targetId, reason, note });
  };

  return (
    <form className="report-form" onSubmit={submit} aria-label={`Report ${what}`} noValidate>
      <fieldset aria-label="What's wrong?">
        <legend className="eyebrow">What&apos;s wrong?</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="report-reason">
            <input type="radio" name={`${id}-reason`} checked={reason === r} onChange={() => (setReason(r), setMissing(false))} />
            {REPORT_REASON_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span className="eyebrow">Anything else? (optional)</span>
        <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {(missing || report.error) && (
        <p className="alert alert-error" role="alert">
          {missing ? "Choose what's wrong." : report.error!.message}
        </p>
      )}
      <div className="report-actions">
        <button type="submit" className="button button-sm" disabled={report.isPending}>
          {report.isPending ? "Sending…" : "Send report"}
        </button>
        <button type="button" className="text-button" onClick={() => (setOpen(false), report.reset())}>
          Cancel
        </button>
      </div>
    </form>
  );
}
