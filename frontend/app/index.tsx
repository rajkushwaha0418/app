import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type Employee } from "@/src/lib/api";
import { colors, labelStyle, space } from "@/src/theme";

export default function Dashboard() {
  const router = useRouter();
  const [total, setTotal] = useState<number>(0);
  const [recent, setRecent] = useState<Employee[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<"ok" | "down" | "checking">("checking");

  const load = useCallback(async () => {
    try {
      const [stats, list] = await Promise.all([api.stats(), api.listEmployees()]);
      setTotal(stats.total);
      setRecent(list.slice(0, 5));
    } catch (e) {
      console.warn("dashboard load failed", e);
    }
  }, []);

  useEffect(() => {
    api
      .ocrHealth()
      .then(() => setOcrStatus("ok"))
      .catch(() => setOcrStatus("down"));
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header} testID="dashboard-header">
          <Text style={styles.eyebrow}>ID CARD SCANNER</Text>
          <Text style={styles.title}>Scan. Extract. Verify.</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.dot,
                ocrStatus === "ok"
                  ? { backgroundColor: colors.success }
                  : ocrStatus === "down"
                    ? { backgroundColor: colors.danger }
                    : { backgroundColor: colors.warning },
              ]}
            />
            <Text style={styles.statusText}>
              OCR ENGINE {ocrStatus === "ok" ? "ONLINE" : ocrStatus === "down" ? "OFFLINE" : "…"}
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsRow}>
          <View style={styles.statBlock} testID="stat-total">
            <Text style={styles.statValue}>{String(total).padStart(2, "0")}</Text>
            <Text style={styles.statLabel}>TOTAL SCANNED</Text>
          </View>
          <View style={[styles.statBlock, styles.statBlockAlt]} testID="stat-synced">
            <Text style={[styles.statValue, { color: colors.primary }]}>{String(total).padStart(2, "0")}</Text>
            <Text style={styles.statLabel}>SYNCED</Text>
          </View>
        </View>

        {/* Primary CTA */}
        <Pressable
          testID="scan-id-button"
          onPress={() => router.push("/scan")}
          style={({ pressed }) => [styles.cta, pressed && { backgroundColor: "#111" }]}
        >
          <Ionicons name="scan" size={28} color="#FFF" />
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={styles.ctaTitle}>SCAN ID CARD</Text>
            <Text style={styles.ctaSub}>Capture front + back, extract instantly</Text>
          </View>
          <Ionicons name="arrow-forward" size={24} color="#FFF" />
        </Pressable>

        {/* Secondary action */}
        <Pressable
          testID="view-employees-button"
          onPress={() => router.push("/employees")}
          style={({ pressed }) => [styles.secondaryBtn, pressed && { backgroundColor: colors.bgAlt }]}
        >
          <Ionicons name="people-outline" size={22} color={colors.text} />
          <Text style={styles.secondaryText}>VIEW ALL EMPLOYEES</Text>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>

        {/* Recent */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECENT SCANS</Text>
          {recent.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No scans yet — tap SCAN ID CARD to start.</Text>
            </View>
          ) : (
            recent.map((e) => (
              <Pressable
                key={e.id}
                testID={`recent-employee-${e.id}`}
                onPress={() => router.push(`/employee/${e.id}`)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgAlt }]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(e.full_name || "?").slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {e.full_name || "UNNAMED"}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {[e.employee_id, e.company_name].filter(Boolean).join(" · ") || "—"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: space.lg, paddingBottom: space.xxl },
  header: { marginBottom: space.xl },
  eyebrow: { ...labelStyle, color: colors.primary, marginBottom: space.sm },
  title: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    color: colors.text,
    lineHeight: 38,
  },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: space.md },
  dot: { width: 8, height: 8, marginRight: space.sm },
  statusText: { ...labelStyle, fontSize: 10 },
  statsRow: { flexDirection: "row", gap: space.sm, marginBottom: space.lg },
  statBlock: {
    flex: 1,
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  statBlockAlt: { backgroundColor: "#EEF2FF", borderColor: "#C7D2FE" },
  statValue: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -2,
    color: colors.text,
    lineHeight: 44,
  },
  statLabel: { ...labelStyle, fontSize: 10, marginTop: space.sm },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.text,
    padding: space.lg,
    marginBottom: space.md,
  },
  ctaTitle: { color: "#FFF", fontWeight: "900", fontSize: 18, letterSpacing: 1 },
  ctaSub: { color: "#D1D5DB", fontSize: 12, marginTop: 2 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.md,
    marginBottom: space.xl,
    gap: space.md,
  },
  secondaryText: { flex: 1, fontWeight: "700", color: colors.text, letterSpacing: 1, fontSize: 13 },
  section: { marginTop: space.md },
  sectionLabel: { ...labelStyle, marginBottom: space.md },
  emptyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    backgroundColor: colors.bgAlt,
  },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.md,
  },
  avatar: {
    width: 44,
    height: 44,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFF", fontWeight: "900", letterSpacing: 1 },
  rowName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
