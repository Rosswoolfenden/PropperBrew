"use client";

import { useId, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, type UploadKind } from "@propperbrew/shared";
import { uploadPhoto } from "@/lib/upload";

/**
 * Choose, change or remove one photo. It uploads as soon as it's chosen and hands back the URL
 * (the form it's in saves it).
 */
export function PhotoPicker({
  kind,
  label,
  value,
  onChange,
  round,
}: {
  kind: UploadKind;
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  round?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) return setError("That photo is too big. Use one under 10 MB.");
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadPhoto(file, kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That photo didn't upload. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="photo-picker" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="eyebrow">
        {label}
      </span>
      <div className="photo-picker-row">
        <div className={`photo-preview${round ? " round" : ""}`}>{value ? <img src={value} alt={`${label} preview`} /> : null}</div>
        <div className="photo-picker-actions">
          <input
            ref={input}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="visually-hidden"
            aria-label={value ? `Change ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <label htmlFor={id} className="button button-secondary button-sm" aria-hidden="true">
            {busy ? "Uploading…" : value ? "Change photo" : "Choose photo"}
          </label>
          {value && !busy && (
            <button type="button" className="text-button" onClick={() => onChange(null)}>
              Remove photo
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
