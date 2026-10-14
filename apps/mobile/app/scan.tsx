import { useMutation } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { radius } from "@propperbrew/shared";
import { fonts, themed } from "@/theme";
import { useTRPC } from "@/trpc";
import { Body, Button, Eyebrow, GUTTER, Headline } from "@/ui";

/** The Vivino moment: photograph the front of the bag → bean page. */
export default function ScanScreen() {
  const trpc = useTRPC();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scan = useMutation(trpc.scanner.scanBag.mutationOptions());
  const styles = useStyles();

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Headline size="section">Scan a bag</Headline>
        <Body italic muted style={{ textAlign: "center" }}>
          Camera access lets you scan coffee bags.
        </Body>
        <Button label="Allow camera" icon="photo-camera" onPress={requestPermission} />
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
        <View style={styles.results}>
          <Eyebrow>
            Read: {scan.data.read.roasterName ?? "?"} — {scan.data.read.beanName ?? "?"}
          </Eyebrow>
          {scan.data.matches.length === 0 && <Body>No match yet. This roaster may not be on PropperBrew.</Body>}
          {scan.data.matches.map((m) => (
            <Pressable
              key={m.id}
              style={styles.match}
              onPress={() =>
                router.replace({ pathname: "/bean/[roaster]/[bean]", params: { roaster: m.roaster.slug, bean: m.slug } })
              }
            >
              <Headline>{m.name}</Headline>
              <Body italic muted>
                {m.roaster.name}
              </Body>
            </Pressable>
          ))}
          <Button label="Scan again" variant="secondary" onPress={() => scan.reset()} />
        </View>
      ) : (
        <CameraView ref={camera} style={{ flex: 1 }} facing="back">
          <View style={styles.shutterBar}>
            {scan.isPending ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Pressable style={styles.shutter} onPress={capture} accessibilityLabel="Take photo" />
            )}
            {scan.error && <Text style={styles.error}>{scan.error.message}</Text>}
          </View>
        </CameraView>
      )}
    </View>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: GUTTER, gap: 16 },
    results: { padding: GUTTER, gap: 16 },
    // Over the camera feed, so these stay white in both schemes.
    shutterBar: { position: "absolute", bottom: 48, left: 0, right: 0, alignItems: "center", gap: 8 },
    shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: "#fff" },
    error: { fontFamily: fonts.label, color: "#fff" },
    match: { gap: 4, padding: 20, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
  }),
);
