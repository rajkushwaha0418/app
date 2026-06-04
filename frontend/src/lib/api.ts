// Thin API client. All requests use EXPO_PUBLIC_BACKEND_URL + /api prefix.

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const API = `${BASE}/api`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type OCRField = { value: string; confidence: number };
export type OCRResponse = {
  fields: Record<string, OCRField>;
  raw_text_front: string;
  raw_text_back: string | null;
  overall_confidence: number;
};

export type Employee = {
  id: string;
  employee_id?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  designation?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  blood_group?: string | null;
  date_of_joining?: string | null;
  expiry_date?: string | null;
  office_address?: string | null;
  pan?: string | null;
  aadhaar?: string | null;
  gender?: string | null;
  nationality?: string | null;
  access_zone?: string | null;
  card_number?: string | null;
  emergency_contact?: string | null;
  photo?: string | null;
  front_image?: string | null;
  back_image?: string | null;
  raw_text?: string | null;
  confidence_score?: number;
  created_at?: string;
  updated_at?: string;
};

export const api = {
  ocrHealth: () => req<{ status: string; tesseract: string; opencv: string }>("/ocr/health"),

  ocrExtract: (front: string, back?: string | null) =>
    req<OCRResponse>("/ocr/extract", {
      method: "POST",
      body: JSON.stringify({ front_image: front, back_image: back || null }),
    }),

  checkDuplicate: (payload: Partial<Employee>) =>
    req<{ duplicate: boolean; match: Employee | null }>("/employees/check-duplicate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createEmployee: (emp: Partial<Employee>) =>
    req<Employee>("/employees", { method: "POST", body: JSON.stringify(emp) }),

  listEmployees: (q?: string) =>
    req<Employee[]>(`/employees${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  stats: () => req<{ total: number }>("/employees/stats"),

  getEmployee: (id: string) => req<Employee>(`/employees/${id}`),

  updateEmployee: (id: string, patch: Partial<Employee>) =>
    req<Employee>(`/employees/${id}`, { method: "PUT", body: JSON.stringify(patch) }),

  deleteEmployee: (id: string) =>
    req<{ deleted: boolean }>(`/employees/${id}`, { method: "DELETE" }),
};
