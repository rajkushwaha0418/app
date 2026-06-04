# ID Card Scanner — PRD

## Vision
Edge-powered OCR mobile app that scans employee ID cards (front + back), extracts
structured fields with Tesseract + OpenCV on the backend, lets the user verify/edit,
and stores records in MongoDB (with optional local SQLite cache).

## Tech
- **Frontend:** Expo Router (React Native), expo-camera, expo-image-picker,
  expo-image-manipulator, expo-sqlite, react-native-safe-area-context.
- **Backend:** FastAPI, motor (MongoDB), pytesseract 0.3.13, opencv-python-headless 4.13,
  Tesseract 5.3 binary (system).
- **Storage:** MongoDB collection `employees` (UUID `id` field, never expose Mongo `_id`).

## OCR Pipeline
1. Base64 → decoded BGR image.
2. OpenCV preprocess: upscale → grayscale → fastNlMeans denoise → CLAHE → deskew → adaptive threshold.
3. Tesseract: two passes (PSM 6 word grid, PSM 4 single-column); pick longer text.
4. Regex + label-line scanning for 19 fields.
5. Per-field confidence (0.6–0.98) and overall (avg Tesseract conf / 100).

## Fields Extracted
employee_id, full_name, company_name, designation, department, email, phone,
date_of_birth, blood_group, date_of_joining, expiry_date, office_address, pan,
aadhaar, gender, nationality, access_zone, card_number, emergency_contact.

## Screens
1. `/` Dashboard — stats, OCR health badge, primary "Scan ID Card" CTA, recent scans.
2. `/scan` Camera with framing overlay, front→back step, gallery fallback, OCR loading screen.
3. `/verify` Auto-filled form with per-field confidence tags; raw OCR text drawer; duplicate check before save.
4. `/employees` Search + list of all saved records.
5. `/employee/[id]` Read view → Edit / Delete (modal confirm).

## APIs
- `GET /api/ocr/health`
- `POST /api/ocr/extract` `{front_image, back_image?}` → `{fields, raw_text_front, raw_text_back, overall_confidence}`
- `POST /api/employees/check-duplicate` `{employee_id?, pan?, aadhaar?, email?}` → `{duplicate, match}`
- `POST /api/employees` create
- `GET /api/employees?q=…` list / search
- `GET /api/employees/stats` totals
- `GET/PUT/DELETE /api/employees/{id}`

## Done
- Tesseract 5.3 + OpenCV 4.13 installed and verified.
- End-to-end OCR pipeline tested on a synthetic ID card → 10/10 fields extracted at 0.94 confidence.
- All CRUD endpoints functional (curl-tested).
- 5 screens implemented with consistent Swiss / Brutalist design system.
- Camera permissions handled (grant + open-settings fallback).
- Front + back capture, gallery picker fallback, skip-back option.
- Duplicate detection by employee_id / pan / aadhaar / email.
