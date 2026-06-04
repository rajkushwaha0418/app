import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type Employee } from "@/src/lib/api";
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
  company_name: "COMPANY",
  designation: "DESIGNATION",
  department: "DEPARTMENT",
  email: "EMAIL",
  phone: "PHONE",
  date_of_birth: "DATE OF BIRTH",
  blood_group: "BLOOD GROUP",
  date_of_joining: "DATE OF JOINING",
  expiry_date: "VALID UPTO",
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

export default function EmployeeDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Partial<Employee>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const e = await api.getEmployee(id);
      setEmp(e);
      setValues(e);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!emp) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<Employee> = {};
      for (const k of ORDER) {
        patch[k] = (values[k] ?? null) as string | null;
      }
      const updated = await api.updateEmployee(emp.id, patch);
      setEmp(updated);
      await localdb.upsert(updated, "synced");
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!emp) return;
    setSaving(true);
    try {
      await api.deleteEmployee(emp.id);
      await localdb.delete(emp.id);
      router.replace("/employees");
    } catch (e: any) {
      setError(e?.message || "Delete failed");
      setSaving(false);
      setConfirmDel(false);
    }
  }

  if (!emp) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="detail-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.eyebrow}>EMPLOYEE RECORD</Text>
          <Text style={styles.title} numberOfLines={1}>
            {emp.full_name || "UNNAMED"}
          </Text>
        </View>
        {editing ? (
          <Pressable
            testID="detail-cancel"
            onPress={() => {
              setValues(emp);
              setEditing(false);
            }}
          >
            <Text style={styles.headerAction}>CANCEL</Text>
          </Pressable>
        ) : (
          <Pressable testID="detail-edit" onPress={() => setEditing(true)}>
            <Text style={styles.headerAction}>EDIT</Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {(emp.front_image || emp.back_image) && (
            <View style={styles.previewRow}>
              {emp.front_image && (
                <View style={styles.previewBox}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${emp.front_image}` }}
                    style={styles.previewImg}
                  />
                  <Text style={styles.previewCap}>FRONT</Text>
                </View>
              )}
              {emp.back_image && (
                <View style={styles.previewBox}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${emp.back_image}` }}
                    style={styles.previewImg}
                  />
                  <Text style={styles.previewCap}>BACK</Text>
                </View>
              )}
            </View>
          )}

          {ORDER.map((key) => (
            <View key={key} style={styles.field}>
              <Text style={styles.fieldLabel}>{FIELD_LABELS[key]}</Text>
              {editing ? (
                <TextInput
                  testID={`detail-field-${key}`}
                  value={(values[key] as string) || ""}
                  onChangeText={(t) => setValues((v) => ({ ...v, [key]: t }))}
                  placeholder="—"
                  placeholderTextColor={colors.textDim}
                  style={styles.input}
                  multiline={key === "office_address"}
                  autoCapitalize={key === "email" ? "none" : "sentences"}
                />
              ) : (
                <Text style={styles.value}>{(emp[key] as string) || "—"}</Text>
              )}
            </View>
          ))}

          {!editing && (
            <Pressable
              testID="detail-delete"
              onPress={() => setConfirmDel(true)}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={styles.deleteText}>DELETE RECORD</Text>
            </Pressable>
          )}

          {error && <Text style={styles.errText}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>

      {editing && (
        <View style={styles.footer}>
          <Pressable
            testID="detail-save"
            onPress={save}
            disabled={saving}
            style={styles.saveBtn}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>SAVE CHANGES</Text>}
          </Pressable>
        </View>
      )}

      {/* Delete confirm */}
      <Modal
        visible={confirmDel}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDel(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="delete-confirm-modal">
            <Text style={styles.modalTitle}>DELETE RECORD?</Text>
            <Text style={styles.modalBody}>
              This permanently removes {emp.full_name || "this employee"} from the directory.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                testID="delete-cancel"
                onPress={() => setConfirmDel(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable testID="delete-confirm" onPress={del} style={styles.modalDelete}>
                <Text style={styles.modalDeleteText}>DELETE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  headerAction: { ...labelStyle, color: colors.primary, fontSize: 12 },
  container: { padding: space.lg, paddingBottom: space.xxl },
  previewRow: { flexDirection: "row", gap: space.md, marginBottom: space.lg },
  previewBox: { flex: 1, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  previewImg: { width: "100%", aspectRatio: 1.586, backgroundColor: colors.bgAlt },
  previewCap: { ...labelStyle, fontSize: 10, marginTop: space.sm, textAlign: "center" },
  field: { marginBottom: space.md },
  fieldLabel: { ...labelStyle, marginBottom: space.xs },
  value: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  input: {
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
    paddingVertical: space.sm,
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    marginTop: space.xl,
    paddingVertical: space.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: { color: colors.danger, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  errText: { color: colors.danger, marginTop: space.md, textAlign: "center" },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: space.md,
  },
  saveBtn: { backgroundColor: colors.text, paddingVertical: space.md + 2, alignItems: "center" },
  saveText: { color: "#FFF", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  modalCard: { backgroundColor: "#FFF", padding: space.lg, width: "100%", maxWidth: 360 },
  modalTitle: { fontWeight: "900", letterSpacing: 1.5, fontSize: 16, color: colors.text },
  modalBody: { color: colors.textMuted, marginTop: space.sm, lineHeight: 20 },
  modalActions: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: space.md, alignItems: "center" },
  modalCancelText: { fontWeight: "900", letterSpacing: 1.5, color: colors.text },
  modalDelete: { flex: 1, backgroundColor: colors.danger, paddingVertical: space.md, alignItems: "center" },
  modalDeleteText: { fontWeight: "900", letterSpacing: 1.5, color: "#FFF" },
});
