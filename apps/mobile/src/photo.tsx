import { MAX_UPLOAD_BYTES, radius, type UploadKind } from "@propperbrew/shared";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "./supabase";
import { fonts, themed, useColors } from "./theme";
import { Button, Eyebrow } from "./ui";

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

/** Upload a picked photo to the API; returns its URL. Throws with a message to show. */
async function uploadPhoto(asset: ImagePicker.ImagePickerAsset, kind: UploadKind): Promise<string> {
  const form = new FormData();
  if (Platform.OS === "web") {
    // On the web the picker hands back a blob/data URL.
    form.append("file", await (await fetch(asset.uri)).blob(), asset.fileName ?? "photo.jpg");
  } else {
    // React Native's FormData takes a file by its URI.
    form.append("file", { uri: asset.uri, name: asset.fileName ?? "photo.jpg", type: asset.mimeType ?? "image/jpeg" } as unknown as Blob);
  }
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${apiUrl}/uploads?kind=${kind}`, {
    method: "POST",
    body: form,
    headers: data.session ? { authorization: `Bearer ${data.session.access_token}` } : {},
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? "That photo didn't upload. Try again.");
  return body.url;
}

/** Choose, change or remove one photo from the library. Uploads as soon as it's chosen. */
export function PhotoField({
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
  const styles = useStyles();
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      // Faces get a square crop to start from; the server makes the final one.
      allowsEditing: kind === "avatar",
      aspect: kind === "avatar" ? [1, 1] : undefined,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) return setError("That photo is too big. Use one under 10 MB.");
    setBusy(true);
    try {
      onChange(await uploadPhoto(asset, kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That photo didn't upload. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View role="group" aria-label={label} style={{ gap: 10 }}>
      <Eyebrow style={{ marginLeft: 4 }}>{label}</Eyebrow>
      <View style={styles.row}>
        <View style={[styles.preview, round && styles.round]}>
          {value && <Image source={{ uri: value }} style={StyleSheet.absoluteFill} accessibilityLabel={`${label} preview`} />}
        </View>
        <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
          <Button
            label={busy ? "Uploading…" : value ? "Change photo" : "Choose photo"}
            variant="secondary"
            icon="photo-library"
            disabled={busy}
            onPress={choose}
          />
          {value && !busy && (
            <Pressable role="button" onPress={() => onChange(null)} hitSlop={8}>
              <Text style={styles.remove}>Remove photo</Text>
            </Pressable>
          )}
        </View>
      </View>
      {error && (
        <Text role="alert" style={{ fontFamily: fonts.label, fontSize: 14, color: colors.error }}>
          {error}
        </Text>
      )}
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 16 },
    preview: { width: 88, height: 88, borderRadius: radius.xl, overflow: "hidden", backgroundColor: c.surfaceContainerHigh },
    round: { borderRadius: 44 },
    remove: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: c.onSurfaceVariant, marginLeft: 4 },
  }),
);
