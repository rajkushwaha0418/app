"""
OCR-Powered ID Card Scanner — FastAPI backend.

Pipeline:
  base64 image -> OpenCV preprocess -> Tesseract OCR -> regex field extraction
                                                     -> structured response
"""
from __future__ import annotations

import base64
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytesseract
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="ID Card Scanner API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ocr")


# ───────────────────────────── Models ──────────────────────────────


class OCRRequest(BaseModel):
    front_image: str  # base64 (with or without data URI prefix)
    back_image: str | None = None


class OCRField(BaseModel):
    value: str
    confidence: float  # 0..1


class OCRResponse(BaseModel):
    fields: dict[str, OCRField]
    raw_text_front: str
    raw_text_back: str | None = None
    overall_confidence: float


class Employee(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str | None = None
    full_name: str | None = None
    company_name: str | None = None
    designation: str | None = None
    department: str | None = None
    email: str | None = None
    phone: str | None = None
    date_of_birth: str | None = None
    blood_group: str | None = None
    date_of_joining: str | None = None
    expiry_date: str | None = None
    office_address: str | None = None
    pan: str | None = None
    aadhaar: str | None = None
    gender: str | None = None
    nationality: str | None = None
    access_zone: str | None = None
    card_number: str | None = None
    emergency_contact: str | None = None
    photo: str | None = None  # base64
    front_image: str | None = None  # base64
    back_image: str | None = None  # base64
    raw_text: str | None = None
    confidence_score: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EmployeeUpdate(BaseModel):
    employee_id: str | None = None
    full_name: str | None = None
    company_name: str | None = None
    designation: str | None = None
    department: str | None = None
    email: str | None = None
    phone: str | None = None
    date_of_birth: str | None = None
    blood_group: str | None = None
    date_of_joining: str | None = None
    expiry_date: str | None = None
    office_address: str | None = None
    pan: str | None = None
    aadhaar: str | None = None
    gender: str | None = None
    nationality: str | None = None
    access_zone: str | None = None
    card_number: str | None = None
    emergency_contact: str | None = None
    photo: str | None = None
    front_image: str | None = None
    back_image: str | None = None


# ───────────────────────────── OCR pipeline ──────────────────────────────


def _decode_image(b64: str) -> np.ndarray:
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def _deskew(gray: np.ndarray) -> np.ndarray:
    coords = np.column_stack(np.where(gray < 200))
    if coords.size < 50:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    if abs(angle) < 0.5:
        return gray
    h, w = gray.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(gray, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def _preprocess(img: np.ndarray) -> np.ndarray:
    """Gray → denoise → CLAHE → adaptive threshold → deskew."""
    # Upscale small images for OCR
    h, w = img.shape[:2]
    if max(h, w) < 1000:
        scale = 1000 / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.fastNlMeansDenoising(gray, h=10)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    gray = _deskew(gray)
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    return thresh


def _ocr(img: np.ndarray) -> tuple[str, float]:
    pre = _preprocess(img)
    data = pytesseract.image_to_data(
        pre, output_type=pytesseract.Output.DICT, config="--oem 3 --psm 6"
    )
    text_lines: list[str] = []
    confs: list[float] = []
    for i, t in enumerate(data["text"]):
        if t and t.strip():
            try:
                c = float(data["conf"][i])
            except (ValueError, TypeError):
                c = -1
            if c > 0:
                confs.append(c)
            text_lines.append(t)
    raw = " ".join(text_lines)
    # Re-run with PSM 4 (single column) and pick whichever has more text
    pre_text2 = pytesseract.image_to_string(pre, config="--oem 3 --psm 4")
    if len(pre_text2) > len(raw):
        raw = pre_text2
    avg_conf = sum(confs) / len(confs) / 100.0 if confs else 0.0
    return raw, avg_conf


# ───────────────────────────── Field extraction ──────────────────────────────

_BLOOD = re.compile(
    r"(?:blood\s*(?:group|type)\s*[:\-]?\s*)?"
    r"\b(A|B|AB|O)\s*([+\-−]|positive|negative|pos|neg|\+ve|-ve)",
    re.I,
)
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# Phone: capture an optional country prefix and 10–12 digits, no leading zeros expanded.
_PHONE = re.compile(
    r"(?:phone|mobile|contact|tel)[^\d+]{0,8}(\+?\d[\d\s\-]{8,13}\d)|"
    r"(?<![\d.+])(\+\d{1,3}[\s\-]?\d{10})(?!\d)|"
    r"(?<![\d.+])(\d{10})(?!\d)",
    re.I,
)
_PAN = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")
# Aadhaar = 12 digits with whitespace between the three groups (avoids phone false positives).
_AADHAAR = re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b")
_DATE = re.compile(
    r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b"
)
# Employee ID: explicit label followed by an alnum token containing at least one digit.
_EMP_ID = re.compile(
    r"\b(?:emp(?:loyee)?\s*(?:id|code|no\.?|number)?|staff\s*id|associate\s*id|"
    r"badge\s*(?:no\.?|number)|id\s*(?:no\.?|number))\s*[:\-]?\s*"
    r"([A-Z]{0,4}[\-/]?\d{2,}[A-Z0-9\-/]*)",
    re.I,
)


def _norm_blood(s: str) -> str:  # kept for backwards-compat; unused
    return s.upper().replace(" ", "")


def _line_after_label(text: str, labels: list[str]) -> str | None:
    """Find a labelled field. Returns the value text after `Label:` on same line
    or on the next line."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    label_re = re.compile(
        r"^\s*(?:" + "|".join(re.escape(lab) for lab in labels) + r")\s*[:\-]?\s*(.*)$",
        re.IGNORECASE,
    )
    for i, ln in enumerate(lines):
        m = label_re.match(ln)
        if not m:
            continue
        val = m.group(1).strip()
        if val:
            return val
        if i + 1 < len(lines):
            return lines[i + 1].strip()
    return None


def _extract_fields(text: str, overall_conf: float) -> dict[str, dict]:
    """Run regex/label scans. Each field returns {value, confidence}."""
    out: dict[str, dict] = {}

    def put(key: str, value: str | None, conf: float):
        if value:
            value = value.strip(" :,-\t")
            if value:
                out[key] = {"value": value, "confidence": round(conf, 2)}

    # Pattern-based
    if m := _EMAIL.search(text):
        put("email", m.group(0).lower(), 0.98)
    if m := _PHONE.search(text):
        ph_raw = next((g for g in m.groups() if g), "")
        ph = re.sub(r"[^\d+]", "", ph_raw)
        digits = ph.lstrip("+")
        if 10 <= len(digits) <= 13:
            put("phone", ph, 0.9)
    if m := _PAN.search(text.upper()):
        put("pan", m.group(0), 0.95)
    if m := _AADHAAR.search(text):
        put("aadhaar", m.group(0), 0.95)
    if m := _BLOOD.search(text):
        letters = m.group(1).upper()
        s = (m.group(2) or "").lower()
        sign = "+" if s in ("+", "positive", "pos", "+ve") else "-"
        bg = letters + sign
        if letters in {"A", "B", "AB", "O"}:
            put("blood_group", bg, 0.9)
    if m := _EMP_ID.search(text):
        val = m.group(1).upper()
        # require at least one digit
        if re.search(r"\d", val):
            put("employee_id", val, 0.9)

    # Label-based scans
    label_map = {
        "full_name": ["name", "employee name", "full name", "holder name", "card holder"],
        "company_name": [
            "company",
            "organization",
            "organisation",
            "employer",
            "company name",
            "organisation name",
            "organization name",
        ],
        "designation": ["designation", "position", "job title", "role", "title"],
        "department": ["department", "dept", "division", "team", "unit"],
        "date_of_birth": ["dob", "date of birth", "d.o.b", "birth date", "born"],
        "date_of_joining": [
            "doj",
            "date of joining",
            "joining date",
            "joined on",
            "hire date",
            "date of join",
        ],
        "expiry_date": [
            "valid upto",
            "valid until",
            "valid till",
            "expiry",
            "expiry date",
            "expires on",
            "expires",
        ],
        "office_address": ["address", "office address", "company address", "branch address"],
        "access_zone": ["access zone", "access level", "zone", "clearance"],
        "card_number": ["card no", "card number", "id no", "badge no", "badge number"],
        "gender": ["gender", "sex"],
        "nationality": ["nationality"],
        "emergency_contact": ["emergency", "emergency contact", "emergency no"],
    }
    for key, labels in label_map.items():
        if key in out:
            continue
        v = _line_after_label(text, labels)
        if v:
            # trim trailing junk
            v = re.split(r"\s{3,}|[\n\r]", v)[0].strip(" :,-")
            if 1 < len(v) < 120:
                put(key, v, max(0.6, min(0.85, overall_conf + 0.1)))

    # Heuristic: a date in DOB/DOJ/expiry positions could fill missing fields
    if "date_of_birth" not in out and "date_of_joining" not in out:
        dates = _DATE.findall(text)
        if dates and len(dates) >= 1:
            put("date_of_birth", dates[0], 0.55)
            if len(dates) >= 2:
                put("date_of_joining", dates[1], 0.55)

    return out


# ───────────────────────────── Routes ──────────────────────────────


@api.get("/")
async def root():
    return {"message": "ID Card Scanner API", "status": "ok"}


@api.get("/ocr/health")
async def ocr_health():
    try:
        ver = str(pytesseract.get_tesseract_version())
        cv_ver = cv2.__version__
        return {"status": "ok", "tesseract": ver, "opencv": cv_ver}
    except Exception as e:  # pragma: no cover
        raise HTTPException(500, f"OCR unavailable: {e}") from e


@api.post("/ocr/extract", response_model=OCRResponse)
async def ocr_extract(req: OCRRequest):
    try:
        front = _decode_image(req.front_image)
    except Exception as e:
        raise HTTPException(400, f"Could not decode front image: {e}") from e
    front_text, front_conf = _ocr(front)

    back_text: str | None = None
    back_conf = 0.0
    if req.back_image:
        try:
            back = _decode_image(req.back_image)
            back_text, back_conf = _ocr(back)
        except Exception as e:
            log.warning("back image OCR failed: %s", e)

    combined = front_text + ("\n" + back_text if back_text else "")
    overall = (front_conf + back_conf) / 2 if back_text else front_conf
    fields_raw = _extract_fields(combined, overall)
    fields = {k: OCRField(**v) for k, v in fields_raw.items()}
    log.info("OCR extracted %d fields (conf=%.2f)", len(fields), overall)
    return OCRResponse(
        fields=fields,
        raw_text_front=front_text,
        raw_text_back=back_text,
        overall_confidence=round(overall, 2),
    )


@api.post("/employees/check-duplicate")
async def check_duplicate(payload: dict[str, Any]):
    """Check if an employee already exists by employee_id or pan or aadhaar."""
    or_clauses: list[dict] = []
    for k in ("employee_id", "pan", "aadhaar", "email"):
        v = payload.get(k)
        if v:
            or_clauses.append({k: v})
    if not or_clauses:
        return {"duplicate": False}
    doc = await db.employees.find_one({"$or": or_clauses}, {"_id": 0})
    return {"duplicate": bool(doc), "match": doc}


@api.post("/employees", response_model=Employee)
async def create_employee(emp: Employee):
    emp.created_at = datetime.now(timezone.utc)
    emp.updated_at = emp.created_at
    doc = emp.model_dump()
    # store a copy so MongoDB's _id mutation doesn't pollute the response
    await db.employees.insert_one({**doc})
    return emp


@api.get("/employees", response_model=list[Employee])
async def list_employees(q: str | None = None, limit: int = 200):
    query: dict = {}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query = {
            "$or": [
                {"full_name": rx},
                {"employee_id": rx},
                {"company_name": rx},
                {"designation": rx},
                {"department": rx},
                {"email": rx},
                {"phone": rx},
            ]
        }
    cursor = db.employees.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [Employee(**doc) async for doc in cursor]


@api.get("/employees/stats")
async def employees_stats():
    total = await db.employees.count_documents({})
    # last 7 days
    return {"total": total}


@api.get("/employees/{emp_id}", response_model=Employee)
async def get_employee(emp_id: str):
    doc = await db.employees.find_one({"id": emp_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Employee not found")
    return Employee(**doc)


@api.put("/employees/{emp_id}", response_model=Employee)
async def update_employee(emp_id: str, update: EmployeeUpdate):
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    data["updated_at"] = datetime.now(timezone.utc)
    res = await db.employees.find_one_and_update(
        {"id": emp_id},
        {"$set": data},
        projection={"_id": 0},
        return_document=True,
    )
    if not res:
        raise HTTPException(404, "Employee not found")
    return Employee(**res)


@api.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str):
    r = await db.employees.delete_one({"id": emp_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Employee not found")
    return {"deleted": True, "id": emp_id}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
