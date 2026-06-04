// expo-sqlite local cache. Mirrors the server's Employee shape.
// Provides offline-first read, with sync_status flag for pending uploads.

import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import type { Employee } from "./api";

type DB = SQLite.SQLiteDatabase;

let _db: DB | null = null;

async function getDB(): Promise<DB | null> {
  // expo-sqlite is no-op on web; we gracefully degrade to API-only.
  if (Platform.OS === "web") return null;
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync("idscanner.db");
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      full_name TEXT,
      company_name TEXT,
      designation TEXT,
      department TEXT,
      email TEXT,
      phone TEXT,
      date_of_birth TEXT,
      blood_group TEXT,
      date_of_joining TEXT,
      expiry_date TEXT,
      office_address TEXT,
      pan TEXT,
      aadhaar TEXT,
      gender TEXT,
      nationality TEXT,
      access_zone TEXT,
      card_number TEXT,
      emergency_contact TEXT,
      sync_status TEXT DEFAULT 'synced',
      created_at TEXT,
      updated_at TEXT,
      payload TEXT
    );
  `);
  return _db;
}

const COLS: (keyof Employee)[] = [
  "id",
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
  "office_address",
  "pan",
  "aadhaar",
  "gender",
  "nationality",
  "access_zone",
  "card_number",
  "emergency_contact",
  "created_at",
  "updated_at",
];

export const localdb = {
  async upsert(emp: Employee, syncStatus: "synced" | "pending" = "synced"): Promise<void> {
    const db = await getDB();
    if (!db) return;
    const values = COLS.map((c) => (emp[c] as string | null | undefined) ?? null);
    const placeholders = COLS.map(() => "?").join(", ");
    await db.runAsync(
      `INSERT OR REPLACE INTO employees (${COLS.join(", ")}, sync_status, payload)
       VALUES (${placeholders}, ?, ?)`,
      [...values, syncStatus, JSON.stringify(emp)],
    );
  },

  async list(q?: string): Promise<Employee[]> {
    const db = await getDB();
    if (!db) return [];
    const rows = q
      ? await db.getAllAsync<{ payload: string }>(
          `SELECT payload FROM employees
           WHERE full_name LIKE ? OR employee_id LIKE ? OR company_name LIKE ?
           ORDER BY created_at DESC`,
          [`%${q}%`, `%${q}%`, `%${q}%`],
        )
      : await db.getAllAsync<{ payload: string }>(
          `SELECT payload FROM employees ORDER BY created_at DESC`,
        );
    return rows.map((r) => JSON.parse(r.payload) as Employee);
  },

  async get(id: string): Promise<Employee | null> {
    const db = await getDB();
    if (!db) return null;
    const row = await db.getFirstAsync<{ payload: string }>(
      `SELECT payload FROM employees WHERE id = ?`,
      [id],
    );
    return row ? (JSON.parse(row.payload) as Employee) : null;
  },

  async delete(id: string): Promise<void> {
    const db = await getDB();
    if (!db) return;
    await db.runAsync(`DELETE FROM employees WHERE id = ?`, [id]);
  },

  async count(): Promise<{ total: number; pending: number }> {
    const db = await getDB();
    if (!db) return { total: 0, pending: 0 };
    const t = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM employees`);
    const p = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM employees WHERE sync_status='pending'`,
    );
    return { total: t?.c ?? 0, pending: p?.c ?? 0 };
  },
};
