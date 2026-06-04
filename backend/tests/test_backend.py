"""Backend tests for OCR ID Card Scanner."""
import base64
import io
import os
import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://id-data-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


# ───────────── Helpers ─────────────


def _make_id_card() -> str:
    """Generate a synthetic ID card image and return base64."""
    img = Image.new("RGB", (1100, 700), "white")
    d = ImageDraw.Draw(img)
    title = ImageFont.truetype(FONT_BOLD, 36)
    label = ImageFont.truetype(FONT_BOLD, 22)
    value = ImageFont.truetype(FONT_REG, 24)

    d.text((40, 30), "ACME CORPORATION", fill="black", font=title)
    d.text((40, 90), "EMPLOYEE IDENTITY CARD", fill="black", font=label)

    rows = [
        ("Name:", "John Anderson"),
        ("Employee ID:", "ACM-12345"),
        ("Designation:", "Senior Engineer"),
        ("Department:", "Engineering"),
        ("Email:", "john.anderson@acme.com"),
        ("Phone:", "9876543210"),
        ("Date of Birth:", "15/04/1988"),
        ("Blood Group:", "B+"),
        ("Date of Joining:", "01/06/2020"),
        ("Valid Upto:", "31/12/2027"),
    ]
    y = 150
    for lab, val in rows:
        d.text((40, y), lab, fill="black", font=label)
        d.text((350, y), val, fill="black", font=value)
        y += 48
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(scope="session")
def card_b64():
    return _make_id_card()


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def created_employee(client):
    """Create one employee, yield, then cleanup."""
    payload = {
        "employee_id": "TEST_EMP_001",
        "full_name": "TEST_John Doe",
        "company_name": "TEST_Acme",
        "designation": "Engineer",
        "department": "QA",
        "email": "test_jd@example.com",
        "phone": "9000000001",
    }
    r = client.post(f"{API}/employees", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    yield data
    # cleanup
    client.delete(f"{API}/employees/{data['id']}")


# ───────────── OCR Endpoints ─────────────


class TestOCR:
    def test_ocr_health(self, client):
        r = client.get(f"{API}/ocr/health")
        assert r.status_code == 200
        j = r.json()
        assert j["status"] == "ok"
        assert "tesseract" in j and j["tesseract"]
        assert "opencv" in j and j["opencv"]

    def test_ocr_extract_basic(self, client, card_b64):
        r = client.post(f"{API}/ocr/extract", json={"front_image": card_b64})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "fields" in j
        assert "overall_confidence" in j
        assert isinstance(j["overall_confidence"], (int, float))
        assert "raw_text_front" in j

    def test_ocr_extract_fields_quality(self, client, card_b64):
        r = client.post(f"{API}/ocr/extract", json={"front_image": card_b64})
        assert r.status_code == 200
        fields = r.json()["fields"]
        expected = [
            "employee_id", "full_name", "email", "phone", "blood_group",
            "date_of_birth", "date_of_joining", "expiry_date",
            "designation", "department",
        ]
        found = [f for f in expected if f in fields]
        print(f"Extracted {len(found)}/{len(expected)} fields: {found}")
        print(f"All fields: {list(fields.keys())}")
        assert len(found) >= 7, f"Only {len(found)} fields extracted, expected >=7. Got: {fields}"

    def test_ocr_aadhaar_not_set_from_phone(self, client, card_b64):
        """Phone (10 digits) must not be classified as aadhaar (12 digits w/ spaces)."""
        r = client.post(f"{API}/ocr/extract", json={"front_image": card_b64})
        assert r.status_code == 200
        fields = r.json()["fields"]
        if "aadhaar" in fields:
            val = fields["aadhaar"]["value"]
            # must match 12-digit with two spaces
            import re
            assert re.match(r"^\d{4}\s\d{4}\s\d{4}$", val), f"Aadhaar mis-extracted: {val}"


# ───────────── Employee CRUD ─────────────


class TestEmployees:
    def test_create_returns_uuid_no_mongo_id(self, client):
        payload = {"employee_id": "TEST_CR_01", "full_name": "TEST_Create", "email": "test_cr@x.com"}
        r = client.post(f"{API}/employees", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "_id" not in j
        assert "id" in j and len(j["id"]) >= 32  # uuid len
        assert j["employee_id"] == "TEST_CR_01"
        # cleanup
        client.delete(f"{API}/employees/{j['id']}")

    def test_check_duplicate_true(self, client, created_employee):
        r = client.post(f"{API}/employees/check-duplicate",
                        json={"employee_id": created_employee["employee_id"]})
        assert r.status_code == 200
        j = r.json()
        assert j["duplicate"] is True
        assert j["match"] is not None
        assert "_id" not in j["match"]

    def test_check_duplicate_false(self, client):
        r = client.post(f"{API}/employees/check-duplicate",
                        json={"employee_id": "TEST_NONEXIST_999"})
        assert r.status_code == 200
        assert r.json()["duplicate"] is False

    def test_list_employees_no_mongo_id(self, client, created_employee):
        r = client.get(f"{API}/employees")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        for it in items:
            assert "_id" not in it

    def test_list_search(self, client, created_employee):
        q = created_employee["full_name"]
        r = client.get(f"{API}/employees", params={"q": q})
        assert r.status_code == 200
        items = r.json()
        ids = [i["id"] for i in items]
        assert created_employee["id"] in ids

    def test_list_search_by_employee_id(self, client, created_employee):
        r = client.get(f"{API}/employees", params={"q": created_employee["employee_id"]})
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()]
        assert created_employee["id"] in ids

    def test_get_employee(self, client, created_employee):
        r = client.get(f"{API}/employees/{created_employee['id']}")
        assert r.status_code == 200
        j = r.json()
        assert j["id"] == created_employee["id"]
        assert "_id" not in j

    def test_get_employee_404(self, client):
        r = client.get(f"{API}/employees/does-not-exist-uuid")
        assert r.status_code == 404

    def test_update_employee(self, client, created_employee):
        r = client.put(f"{API}/employees/{created_employee['id']}",
                       json={"designation": "Lead Engineer"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["designation"] == "Lead Engineer"
        assert "_id" not in j
        # verify GET reflects
        r2 = client.get(f"{API}/employees/{created_employee['id']}")
        assert r2.json()["designation"] == "Lead Engineer"

    def test_stats(self, client, created_employee):
        r = client.get(f"{API}/employees/stats")
        assert r.status_code == 200
        j = r.json()
        assert "total" in j
        assert j["total"] >= 1

    def test_delete_employee(self, client):
        # create, then delete, then verify 404
        r = client.post(f"{API}/employees",
                        json={"employee_id": "TEST_DEL", "full_name": "TEST_Delete"})
        eid = r.json()["id"]
        r2 = client.delete(f"{API}/employees/{eid}")
        assert r2.status_code == 200
        assert r2.json()["deleted"] is True
        r3 = client.get(f"{API}/employees/{eid}")
        assert r3.status_code == 404

    def test_delete_404(self, client):
        r = client.delete(f"{API}/employees/nonexistent-uuid")
        assert r.status_code == 404
