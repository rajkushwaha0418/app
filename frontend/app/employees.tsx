import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type Employee } from "@/src/lib/api";
import { colors, labelStyle, space } from "@/src/theme";

export default function EmployeesScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [data, setData] = useState<Employee[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (query?: string) => {
    try {
      const list = await api.listEmployees(query);
      setData(list);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(q);
    }, [load, q]),
  );

  const renderItem = ({ item }: { item: Employee }) => (
    <Pressable
      testID={`employee-row-${item.id}`}
      onPress={() => router.push(`/employee/${item.id}`)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgAlt }]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(item.full_name || "?").slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.full_name || "UNNAMED"}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[item.employee_id, item.designation].filter(Boolean).join(" · ") || "—"}
        </Text>
        {item.company_name ? (
          <Text style={styles.metaDim} numberOfLines={1}>
            {item.company_name}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="employees-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Text style={styles.eyebrow}>DIRECTORY</Text>
          <Text style={styles.title}>EMPLOYEES · {data.length}</Text>
        </View>
        <Pressable
          testID="employees-add"
          onPress={() => router.push("/scan")}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={22} color="#FFF" />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textDim} />
        <TextInput
          testID="employees-search"
          value={q}
          onChangeText={(t) => {
            setQ(t);
            load(t);
          }}
          placeholder="SEARCH BY NAME, ID, COMPANY…"
          placeholderTextColor={colors.textDim}
          style={styles.searchInput}
        />
        {q.length > 0 && (
          <Pressable
            onPress={() => {
              setQ("");
              load("");
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={colors.textDim} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={data}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load(q);
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty} testID="employees-empty">
            <Ionicons name="albums-outline" size={42} color={colors.textDim} />
            <Text style={styles.emptyTitle}>NOTHING TO SHOW</Text>
            <Text style={styles.emptyBody}>
              {q ? "No matches for that query." : "Tap + to scan your first ID card."}
            </Text>
          </View>
        }
        contentContainerStyle={data.length === 0 ? styles.emptyContainer : undefined}
      />
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
  addBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    margin: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgAlt,
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: space.sm + 2,
    fontSize: 13,
    color: colors.text,
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: space.md,
  },
  avatar: {
    width: 48,
    height: 48,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFF", fontWeight: "900", letterSpacing: 1 },
  name: { color: colors.text, fontWeight: "700", fontSize: 16 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  metaDim: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  empty: { alignItems: "center", padding: space.xl, gap: space.sm },
  emptyContainer: { flex: 1, justifyContent: "center" },
  emptyTitle: { ...labelStyle, marginTop: space.md, fontSize: 13 },
  emptyBody: { color: colors.textMuted, textAlign: "center" },
});
