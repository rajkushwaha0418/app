import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { colors, labelStyle, space } from "@/src/theme";

type Step = "front" | "back" | "processing";

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [step, setStep] = useState<Step>("front");
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compressToB64(uri: string): Promise<string> {
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1400 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return out.base64!;
  }

  async function shoot() {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (!photo?.uri) throw new Error("No image captured");
      const b64 = await compressToB64(photo.uri);
      if (step === "front") {
        setFront(b64);
        setStep("back");
      } else if (step === "back") {
        setBack(b64);
        await runOCR(front!, b64);
      }
    } catch (e: any) {
      setError(e?.message || "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  async function pickFromLibrary() {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setBusy(true);
      const b64 = await compressToB64(res.assets[0].uri);
      if (step === "front") {
        setFront(b64);
        setStep("back");
      } else {
        setBack(b64);
        await runOCR(front!, b64);
      }
    } catch (e: any) {
      setError(e?.message || "Could not load image");
    } finally {
      setBusy(false);
    }
  }

  async function skipBack() {
    if (!front) return;
    await runOCR(front, null);
  }

  async function runOCR(f: string, b: string | null) {
    setStep("processing");
    setBusy(true);
    setError(null);
    try {
      const ocr = await api.ocrExtract(f, b);
      const params: Record<string, string> = {
        front_image: f,
        ocr_data: JSON.stringify(ocr),
      };
      if (b) params.back_image = b;
      router.replace({ pathname: "/verify", params });
    } catch (e: any) {
      setError(e?.message || "OCR failed");
      setStep("front");
    } finally {
      setBusy(false);
    }
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen} edges={["top", "bottom"]}>
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={48} color={colors.text} />
          <Text style={styles.permissionTitle}>CAMERA ACCESS</Text>
          <Text style={styles.permissionBody}>
            We need camera access to scan ID cards. Images stay on-device until you save.
          </Text>
          {permission.canAskAgain ? (
            <Pressable
              testID="camera-permission-grant"
              onPress={requestPermission}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>GRANT ACCESS</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="camera-permission-settings"
              onPress={() => Linking.openSettings()}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>OPEN SETTINGS</Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} style={styles.linkBtn}>
            <Text style={styles.linkText}>CANCEL</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === "processing") {
    return (
      <SafeAreaView style={styles.processScreen} edges={["top", "bottom"]}>
        <View style={styles.processBox}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.processTitle}>EXTRACTING DATA</Text>
          <Text style={styles.processBody}>
            Running OpenCV preprocessing → Tesseract OCR → field detection
          </Text>
          {error && <Text style={styles.processError}>{error}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        autofocus="on"
      />

      {/* Overlay */}
      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable testID="scan-close-button" onPress={() => router.back()} style={styles.topBtn}>
            <Ionicons name="close" size={26} color="#FFF" />
          </Pressable>
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, step === "front" && styles.stepDotActive]} />
            <View style={[styles.stepDot, step === "back" && styles.stepDotActive]} />
          </View>
          <View style={styles.topBtn} />
        </View>

        <View style={styles.frameWrap} pointerEvents="none">
          <Text style={styles.frameLabel}>
            {step === "front" ? "ALIGN CARD FRONT" : "ALIGN CARD BACK"}
          </Text>
          <View style={styles.cardFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.frameHint}>
            Place the ID card inside the frame and hold steady.
          </Text>
        </View>

        {front && step === "back" && (
          <View style={styles.previewStrip}>
            <Image source={{ uri: `data:image/jpeg;base64,${front}` }} style={styles.previewImg} />
            <Text style={styles.previewLabel}>FRONT CAPTURED ✓</Text>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.controls}>
          <Pressable
            testID="scan-library-button"
            onPress={pickFromLibrary}
            disabled={busy}
            style={styles.sideBtn}
          >
            <Ionicons name="images-outline" size={24} color="#FFF" />
            <Text style={styles.sideBtnText}>GALLERY</Text>
          </Pressable>

          <Pressable
            testID="scan-shutter-button"
            onPress={shoot}
            disabled={busy}
            style={({ pressed }) => [styles.shutter, pressed && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </Pressable>

          {step === "back" ? (
            <Pressable testID="scan-skip-back" onPress={skipBack} disabled={busy} style={styles.sideBtn}>
              <Ionicons name="arrow-forward-circle-outline" size={24} color="#FFF" />
              <Text style={styles.sideBtnText}>SKIP BACK</Text>
            </Pressable>
          ) : (
            <View style={styles.sideBtn} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  permissionScreen: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: space.lg },
  permissionBox: { alignItems: "center", gap: space.md },
  permissionTitle: { ...labelStyle, fontSize: 13, color: colors.text, marginTop: space.md },
  permissionBody: { color: colors.textMuted, textAlign: "center", paddingHorizontal: space.md },
  primaryBtn: {
    backgroundColor: colors.text,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    marginTop: space.md,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "900", letterSpacing: 1.5 },
  linkBtn: { padding: space.md },
  linkText: { ...labelStyle },

  cameraWrap: { flex: 1, backgroundColor: "#000" },
  overlay: { flex: 1, justifyContent: "space-between" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingTop: Platform.OS === "android" ? space.md : 0,
  },
  topBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  stepIndicator: { flexDirection: "row", gap: space.sm },
  stepDot: { width: 32, height: 4, backgroundColor: "rgba(255,255,255,0.3)" },
  stepDotActive: { backgroundColor: "#FFF" },
  frameWrap: { alignItems: "center", paddingHorizontal: space.lg },
  frameLabel: {
    color: "#FFF",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 12,
    marginBottom: space.md,
  },
  cardFrame: { width: "100%", aspectRatio: 1.586, position: "relative" },
  corner: { position: "absolute", width: 28, height: 28, borderColor: "#FFF" },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  frameHint: {
    color: "rgba(255,255,255,0.7)",
    marginTop: space.md,
    fontSize: 12,
    textAlign: "center",
  },
  previewStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    marginHorizontal: space.lg,
    padding: space.sm,
    gap: space.md,
  },
  previewImg: { width: 60, height: 38, backgroundColor: "#222" },
  previewLabel: { color: colors.success, fontWeight: "700", letterSpacing: 1, fontSize: 11 },
  errorText: {
    color: colors.danger,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: space.sm,
    marginHorizontal: space.lg,
    textAlign: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: space.lg,
    paddingHorizontal: space.lg,
  },
  sideBtn: { alignItems: "center", width: 80 },
  sideBtnText: { color: "#FFF", fontSize: 10, letterSpacing: 1.5, marginTop: 4, fontWeight: "700" },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.4)",
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#FFF", borderWidth: 2, borderColor: "#000" },

  processScreen: { flex: 1, backgroundColor: "#0A0A0A", justifyContent: "center", padding: space.lg },
  processBox: { alignItems: "center", gap: space.md },
  processTitle: { color: "#FFF", fontWeight: "900", letterSpacing: 2, fontSize: 14, marginTop: space.md },
  processBody: { color: "#9CA3AF", textAlign: "center", paddingHorizontal: space.lg, fontSize: 13 },
  processError: { color: colors.danger, marginTop: space.md },
});
