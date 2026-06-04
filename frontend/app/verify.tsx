import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type Employee, type OCRResponse } from "@/src/lib/api";
import { localdb } from "@/src/lib/localdb";
import { colors, labelStyle, space } from "@/src/theme";

type FieldKey =
  | "employee_id"
  | "full_name"
  | "company_name"
  | "designation"
  | "department"
  | "email"
  | "phone"
  | "date_of_birth"
  | "blood_group"
  | "date_of_joining"
  | "expiry_date"
  | "office_address"
  | "pan"
  | "aadhaar"
  | "gender"
  | "nationality"
  | "access_zone"
  | "card_number"
  | "emergency_contact";

const FIELD_LABELS: Record<FieldKey, string> = {
  employee_id: "EMPLOYEE ID",
  full_name: "FULL NAME",
  company_name: "COMPANY / ORGANIZATION",
  designation: "DESIGNATION",
  department: "DEPARTMENT",
  email: "EMAIL",
  phone: "PHONE",
  date_of_birth: "DATE OF BIRTH",
  blood_group: "BLOOD GROUP",
  date_of_joining: "DATE OF JOINING",
  expiry_date: "VALID UPTO / EXPIRY",
  office_address: "OFFICE ADDRESS",
  pan: "PAN",
  aadhaar: "AADHAAR",
  gender: "GENDER",
  nationality: "NATIONALITY",
  access_zone: "ACCESS ZONE",
  card_number: "CARD NUMBER",
  emergency_contact: "EMERGENCY CONTACT",
};

const ORDER: FieldKey[] = [
  "employee_id",
  "full_name",
  "company_name",
  "designation",
  "department",
  "email",
  "phone",
  "date_of_birth",
  "blood_group",
  "date_of_joining",
  "expiry_date",
  "card_number",
  "access_zone",
  "office_address",
  "pan",
  "aadhaar",
  "gender",
  "nationality",
  "emergency_contact",
];

function confTag(c?: number): { label: string; color: string } | null {
  if (c == null) return null;
  if (c >= 0.85) return { label: `${Math.round(c * 100)}%`, color: colors.success };
  if (c >= 0.6) return { label: `${Math.round(c * 100)}%`, color: colors.warning };
  return { label: `${Math.round(c * 100)}%`, color: colors.danger };
}

export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    front_image?: string;
    back_image?: string;
    ocr_data?: string;
  }>();

  const ocr: OCRResponse | null = useMemo(() => {
    try {
      return params.ocr_data ? (JSON.parse(params.ocr_data) as OCRResponse) : null;
    } catch {
      return null;
    }
  }, [params.ocr_data]);

  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>(() => {
    const v: Partial<Record<FieldKey, string>> = {};
    if (ocr) {
      for (const k of ORDER) {
        const f = ocr.fields[k];
        if (f) v[k] = f.value;
      }
    }
    return v;
  });

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "dup"; text: string } | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const filledCount = Object.values(values).filter(Boolean).length;
  const overall = ocr?.overall_confidence ?? 0;

  async function save() {
    if (saving) return;
    if (!values.full_name && !values.employee_id) {
      setStatus({ kind: "err", text: "Need at least Full Name or Employee ID" });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      // Duplicate check
      const dup = await api.checkDuplicate({
        employee_id: values.employee_id || undefined,
        pan: values.pan || undefined,
        aadhaar: values.aadhaar || undefined,
        email: values.email || undefined,
      });
      if (dup.duplicate) {
        setStatus({
          kind: "dup",
          text: `Already exists: ${dup.match?.full_name || dup.match?.employee_id || "duplicate"}`,
        });
        setSaving(false);
        return;
      }
      const payload: Partial<Employee> = {
        ...values,
        front_image: params.front_image || null,
        back_image: params.back_image || null,
        raw_text: ocr ? `${ocr.raw_text_front}\n\n${ocr.raw_text_back || ""}`.trim() : null,
        confidence_score: overall,
      };
      const saved = await api.createEmployee(payload);
      // mirror locally
      await localdb.upsert(saved, "synced");
      router.replace(`/employee/${saved.id}`);
    } catch (e: any) {
      setStatus({ kind: "err", text: e?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="verify-back-button" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.eyebrow}>VERIFY EXTRACTED DATA</Text>
          <Text style={styles.title}>
            {filledCount}/{ORDER.length} FIELDS · {Math.round(overall * 100)}%
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Image previews */}
          {(params.front_image || params.back_image) && (
            <View style={styles.previewRow}>
              {params.front_image && (
                <View style={styles.previewBox}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${params.front_image}` }}
                    style={styles.previewImg}
                  />
                  <Text style={styles.previewCap}>FRONT</Text>
                </View>
              )}
              {params.back_image && (
                <View style={styles.previewBox}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${params.back_image}` }}
                    style={styles.previewImg}
                  />
                  <Text style={styles.previewCap}>BACK</Text>
                </View>
              )}
            </View>
          )}

          {/* Fields */}
          {ORDER.map((key) => {
            const conf = ocr?.fields[key]?.confidence;
            const tag = confTag(conf);
            return (
              <View key={key} style={styles.field}>
                <View style={styles.fieldHeader}>
                  <Text style={styles.fieldLabel}>{FIELD_LABELS[key]}</Text>
                  {tag && (
                    <View style={[styles.confTag, { borderColor: tag.color }]}>
                      <Text style={[styles.confTagText, { color: tag.color }]}>{tag.label}</Text>
                    </View>
                  )}
                </View>
                <TextInput
                  testID={`field-${key}`}
                  value={values[key] || ""}
                  onChangeText={(t) => setValues((v) => ({ ...v, [key]: t }))}
                  placeholder="—"
                  placeholderTextColor={colors.textDim}
                  style={styles.input}
                  multiline={key === "office_address"}
                  autoCapitalize={
                    key === "email" ? "none" : key === "pan" ? "characters" : "sentences"
                  }
                  keyboardType={
                    key === "email"
                      ? "email-address"
                      : key === "phone" || key === "emergency_contact"
                        ? "phone-pad"
                        : "default"
                  }
                />
              </View>
            );
          })}

          {/* Raw OCR toggle */}
          <Pressable
            testID="toggle-raw-ocr"
            onPress={() => setShowRaw((s) => !s)}
            style={styles.rawToggle}
          >
            <Ionicons
              name={showRaw ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.textMuted}
            />
            <Text style={styles.rawToggleText}>
              {showRaw ? "HIDE" : "SHOW"} RAW OCR TEXT
            </Text>
          </Pressable>
          {showRaw && ocr && (
            <View style={styles.rawBox} testID="raw-ocr-text">
              <Text style={styles.rawText}>
                {ocr.raw_text_front}
                {ocr.raw_text_back ? `\n\n— BACK —\n${ocr.raw_text_back}` : ""}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        {status && (
          <View
            testID="verify-status"
            style={[
              styles.statusBar,
              status.kind === "ok" && { backgroundColor: "#ECFDF5" },
              status.kind === "err" && { backgroundColor: "#FEF2F2" },
              status.kind === "dup" && { backgroundColor: "#FFFBEB" },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                status.kind === "ok" && { color: colors.success },
                status.kind === "err" && { color: colors.danger },
                status.kind === "dup" && { color: colors.warning },
              ]}
            >
              {status.text}
            </Text>
          </View>
        )}
        <Pressable
          testID="save-employee-button"
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            (pressed || saving) && { backgroundColor: "#1F2937" },
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveText}>SAVE EMPLOYEE</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eyebrow: { ...labelStyle, color: colors.primary, marginBottom: 2 },
  title: { fontSize: 16, fontWeight: "900", letterSpacing: -0.3, color: colors.text },
  container: { padding: space.lg, paddingBottom: space.xl },
  previewRow: { flexDirection: "row", gap: space.md, marginBottom: space.lg },
  previewBox: { flex: 1, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  previewImg: { width: "100%", aspectRatio: 1.586, backgroundColor: colors.bgAlt },
  previewCap: { ...labelStyle, fontSize: 10, marginTop: space.sm, textAlign: "center" },
  field: { marginBottom: space.md },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.xs,
  },
  fieldLabel: { ...labelStyle },
  confTag: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  confTagText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  input: {
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
    paddingVertical: space.sm,
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  rawToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: space.md,
    paddingVertical: space.sm,
  },
  rawToggleText: { ...labelStyle, color: colors.textMuted },
  rawBox: {
    backgroundColor: "#0A0A0A",
    padding: space.md,
    marginTop: space.sm,
  },
  rawText: { color: "#A3E635", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: space.md,
    backgroundColor: colors.bg,
  },
  statusBar: { padding: space.sm, marginBottom: space.sm, borderWidth: 1, borderColor: colors.border },
  statusText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  saveBtn: {
    backgroundColor: colors.text,
    paddingVertical: space.md + 2,
    alignItems: "center",
  },
  saveText: { color: "#FFF", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
});
