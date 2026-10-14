import { useMutation } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef } from "react";
import { ActivityIndicator, Button, Pressable, StyleSheet, Text, View } from "react-native";
import { useTRPC } from "@/trpc";

/** The Vivino moment: photograph the front of the bag → bean page. */
export default function ScanScreen() {
  const trpc = useTRPC();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scan = useMutation(trpc.scanner.scanBag.mutationOptions());

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{ marginBottom: 12 }}>Camera access lets you scan coffee bags.</Text>
        <Button title="Allow camera" onPress={requestPermission} />
      </View>
    );
  }

  const capture = async () => {
    const photo = await camera.current?.takePictureAsync({ base64: true, quality: 0.5 });
    if (!photo?.base64) return;
    const result = await scan.mutateAsync({ imageBase64: photo.base64, mediaType: "image/jpeg" });
    const best = result.matches[0];
    if (best && result.matches.length === 1) {
      router.replace({ pathname: "/bean/[roaster]/[bean]", params: { roaster: best.roaster.slug, bean: best.slug } });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {scan.data ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={styles.muted}>
            Read: {scan.data.read.roasterName ?? "?"} — {scan.data.read.beanName ?? "?"}
          </Text>
          {scan.data.matches.length === 0 && <Text>No match yet. This roaster may not be on PropperBrew.</Text>}
          {scan.data.matches.map((m) => (
            <Pressable
              key={m.id}
              style={styles.match}
              onPress={() =>
                router.replace({ pathname: "/bean/[roaster]/[bean]", params: { roaster: m.roaster.slug, bean: m.slug } })
              }
            >
              <Text style={{ fontWeight: "600" }}>{m.name}</Text>
              <Text style={styles.muted}>{m.roaster.name}</Text>
            </Pressable>
          ))}
          <Button title="Scan again" onPress={() => scan.reset()} />
        </View>
      ) : (
        <CameraView ref={camera} style={{ flex: 1 }} facing="back">
          <View style={styles.shutterBar}>
            {scan.isPending ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Pressable style={styles.shutter} onPress={capture} accessibilityLabel="Take photo" />
            )}
            {scan.error && <Text style={{ color: "#fff" }}>{scan.error.message}</Text>}
          </View>
        </CameraView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  shutterBar: { position: "absolute", bottom: 48, left: 0, right: 0, alignItems: "center", gap: 8 },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: "#fff" },
  match: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#e8dfd4" },
  muted: { color: "#7a6a5e" },
});
