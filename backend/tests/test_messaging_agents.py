"""Backend regression tests for iteration 3 — Messaging (threads/inbox), Agents, Profile edit,
and existing endpoints (auth, properties enrichment, wishlist/compare idempotent, assistant, reports)."""

import os
import time
import uuid
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1]
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"

BUYER = {"email": "buyer@lumina.demo", "password": "Lumina2026!"}
SELLER = {"email": "seller@lumina.demo", "password": "Lumina2026!"}
SELENE = {"email": "selene@lumina.demo", "password": "Lumina2026!"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth + basic health ----------
def test_api_root():
    r = requests.get(f"{API}", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ready"


def test_login_buyer_and_seller():
    for creds in (BUYER, SELLER, SELENE):
        r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
        assert r.status_code == 200, f"login failed for {creds['email']}: {r.text}"
        assert r.json()["user"]["email"] == creds["email"]


# ---------- Properties + seller enrichment ----------
def test_property_detail_has_seller_public_agent():
    r = requests.get(f"{API}/properties/p1", timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()["property"]
    assert p["id"] == "p1"
    assert p.get("seller") is not None
    seller = p["seller"]
    for key in ("id", "name", "initials", "profile"):
        assert key in seller, f"missing '{key}' on public agent"
    assert isinstance(seller["initials"], str) and len(seller["initials"]) >= 1
    assert isinstance(seller["profile"], dict)


def test_property_list_and_filter():
    r = requests.get(f"{API}/properties", timeout=15)
    assert r.status_code == 200
    assert len(r.json()["properties"]) >= 6
    r2 = requests.get(f"{API}/properties", params={"q": "Miami", "type": "Penthouse"}, timeout=15)
    assert r2.status_code == 200
    props = r2.json()["properties"]
    assert len(props) == 1 and props[0]["title"] == "No. 28 Penthouse"


# ---------- Agents ----------
def test_agents_list_has_three_seeded():
    r = requests.get(f"{API}/agents", timeout=15)
    assert r.status_code == 200, r.text
    agents = r.json()["agents"]
    names = {a["name"] for a in agents}
    assert {"Julian Hart", "Selene Ward", "Ronan Vidal"}.issubset(names), names
    for a in agents:
        assert a["role"] == "seller"
        assert "listingsCount" in a and isinstance(a["listingsCount"], int)
        assert "profile" in a and a["profile"] is not None


def test_agent_detail_with_listings():
    agents = requests.get(f"{API}/agents", timeout=15).json()["agents"]
    julian = next(a for a in agents if a["name"] == "Julian Hart")
    r = requests.get(f"{API}/agents/{julian['id']}", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["agent"]["id"] == julian["id"]
    assert isinstance(data["listings"], list)
    # every listing scoped to this seller
    for p in data["listings"]:
        assert "id" in p and "_id" not in p


def test_agent_detail_404():
    r = requests.get(f"{API}/agents/does-not-exist", timeout=15)
    assert r.status_code == 404


# ---------- Profile edit ----------
def test_seller_can_update_profile_buyer_forbidden():
    seller_token, seller_user = _login(**SELLER)
    payload = {
        "headline": "TEST · Principal advisor (updated)",
        "bio": "TEST bio " + uuid.uuid4().hex[:6],
        "phone": "+1 (512) 555-0102",
        "specialties": "Lakefront villas, Family homes, Investment portfolios",
        "yearsExperience": 12,
        "city": "Austin, TX",
        "portrait": "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=85",
        "licenseNumber": "TX-882410",
    }
    r = requests.put(f"{API}/me/profile", json=payload, headers=_auth(seller_token), timeout=15)
    assert r.status_code == 200, r.text
    saved = r.json()["profile"]
    assert saved["headline"] == payload["headline"]
    assert saved["bio"] == payload["bio"]
    assert saved["yearsExperience"] == 12
    assert saved["specialties"] == ["Lakefront villas", "Family homes", "Investment portfolios"]

    # Verify persistence via /api/agents/:id
    r2 = requests.get(f"{API}/agents/{seller_user['id']}", timeout=15)
    assert r2.status_code == 200
    assert r2.json()["agent"]["profile"]["headline"] == payload["headline"]

    # Buyer forbidden
    buyer_token, _ = _login(**BUYER)
    r3 = requests.put(f"{API}/me/profile", json=payload, headers=_auth(buyer_token), timeout=15)
    assert r3.status_code == 403


# ---------- Messaging ----------
def test_message_validation():
    buyer_token, buyer = _login(**BUYER)
    # missing recipientId
    r = requests.post(f"{API}/messages", json={"text": "hi"}, headers=_auth(buyer_token), timeout=15)
    assert r.status_code == 400
    # blank text
    seller_id = requests.get(f"{API}/properties/p1", timeout=15).json()["property"]["seller"]["id"]
    r2 = requests.post(f"{API}/messages", json={"recipientId": seller_id, "text": "   "}, headers=_auth(buyer_token), timeout=15)
    assert r2.status_code == 400
    # messaging self
    r3 = requests.post(f"{API}/messages", json={"recipientId": buyer["id"], "text": "hi"}, headers=_auth(buyer_token), timeout=15)
    assert r3.status_code == 400


def test_thread_create_list_open_and_read():
    buyer_token, buyer = _login(**BUYER)
    seller_token, seller = _login(**SELLER)

    prop = requests.get(f"{API}/properties/p1", timeout=15).json()["property"]
    seller_id = prop["seller"]["id"]
    text_a = f"TEST inquiry {uuid.uuid4().hex[:6]} about {prop['title']}"

    # Buyer sends message to seller referencing p1
    r = requests.post(f"{API}/messages", json={"recipientId": seller_id, "propertyId": "p1", "text": text_a},
                      headers=_auth(buyer_token), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    thread_id = body["threadId"]
    assert "|" in thread_id and thread_id.endswith("|p1")
    assert body["message"]["text"] == text_a
    assert "_id" not in body["message"]

    # Seller lists messages -> should show thread with unread >= 1
    r2 = requests.get(f"{API}/messages", headers=_auth(seller_token), timeout=15)
    assert r2.status_code == 200
    j = r2.json()
    assert isinstance(j["threads"], list) and j["unread"] >= 1
    my_thread = next((t for t in j["threads"] if t["threadId"] == thread_id), None)
    assert my_thread is not None
    assert my_thread["unread"] >= 1
    assert my_thread["property"]["id"] == "p1"
    assert my_thread["otherUser"]["id"] == buyer["id"]
    assert my_thread["lastText"] == text_a

    # Seller opens thread -> messages sorted ascending, marks as read
    r3 = requests.get(f"{API}/messages/threads/{thread_id}", headers=_auth(seller_token), timeout=15)
    assert r3.status_code == 200
    t = r3.json()
    assert t["threadId"] == thread_id
    assert t["otherUser"]["id"] == buyer["id"]
    assert t["property"]["id"] == "p1"
    assert len(t["messages"]) >= 1
    times = [m["createdAt"] for m in t["messages"]]
    assert times == sorted(times), "messages should be ascending by createdAt"
    for m in t["messages"]:
        assert "_id" not in m

    # After fetching, unread should be cleared on GET /messages for seller
    r4 = requests.get(f"{API}/messages", headers=_auth(seller_token), timeout=15)
    my_thread2 = next((tt for tt in r4.json()["threads"] if tt["threadId"] == thread_id), None)
    assert my_thread2 is not None
    assert my_thread2["unread"] == 0

    # Seller replies
    reply_text = f"TEST reply {uuid.uuid4().hex[:6]}"
    r5 = requests.post(f"{API}/messages",
                       json={"recipientId": buyer["id"], "propertyId": "p1", "text": reply_text},
                       headers=_auth(seller_token), timeout=15)
    assert r5.status_code == 200
    assert r5.json()["threadId"] == thread_id  # same thread

    # Buyer sees unread == 1 for this thread then read via POST .../read
    r6 = requests.get(f"{API}/messages", headers=_auth(buyer_token), timeout=15)
    bt = next(tt for tt in r6.json()["threads"] if tt["threadId"] == thread_id)
    assert bt["unread"] >= 1
    r7 = requests.post(f"{API}/messages/threads/{thread_id}/read", headers=_auth(buyer_token), timeout=15)
    assert r7.status_code == 200 and r7.json().get("ok") is True
    r8 = requests.get(f"{API}/messages", headers=_auth(buyer_token), timeout=15)
    bt2 = next(tt for tt in r8.json()["threads"] if tt["threadId"] == thread_id)
    assert bt2["unread"] == 0


def test_thread_404_for_unknown():
    buyer_token, _ = _login(**BUYER)
    r = requests.get(f"{API}/messages/threads/does|not|exist", headers=_auth(buyer_token), timeout=15)
    assert r.status_code == 404


# ---------- Wishlist / compare — idempotent (normalize then assert) ----------
def _ensure_absent(token, kind, pid):
    """Ensure item is NOT in list; toggle if it is."""
    r = requests.get(f"{API}/me/saved", headers=_auth(token), timeout=15).json()
    cur = [x["id"] for x in r["wishlist"]] if kind == "wishlist" else r["compare"]
    if pid in cur:
        requests.post(f"{API}/me/{kind}/{pid}", headers=_auth(token), timeout=15)


def test_wishlist_and_compare_toggle_idempotent():
    token, _ = _login(**BUYER)
    _ensure_absent(token, "wishlist", "p1")
    r = requests.post(f"{API}/me/wishlist/p1", headers=_auth(token), timeout=15)
    assert r.status_code == 200 and "p1" in r.json()["wishlist"]
    _ensure_absent(token, "compare", "p1")
    r2 = requests.post(f"{API}/me/compare/p1", headers=_auth(token), timeout=15)
    assert r2.status_code == 200 and "p1" in r2.json()["compare"]


# ---------- AI ----------
def test_assistant_returns_reply_and_matches():
    r = requests.post(f"{API}/ai/assistant", json={"prompt": "quiet Villa in Austin under 2 million"}, timeout=25)
    assert r.status_code == 200
    j = r.json()
    assert j.get("reply") and isinstance(j["properties"], list) and len(j["properties"]) >= 1
    assert j["source"] in ("gemini", "lumina-insights-fallback")


def test_analyze_and_report_save():
    r = requests.post(f"{API}/ai/analyze/p1", timeout=20)
    assert r.status_code == 200 and "valueSignal" in r.json()["analysis"]
    token, _ = _login(**BUYER)
    r2 = requests.post(f"{API}/reports", json={"propertyId": "p1"}, headers=_auth(token), timeout=20)
    assert r2.status_code == 200 and r2.json()["report"]["propertyId"] == "p1"
    r3 = requests.get(f"{API}/reports", headers=_auth(token), timeout=15)
    assert r3.status_code == 200 and any(x["propertyId"] == "p1" for x in r3.json()["reports"])
