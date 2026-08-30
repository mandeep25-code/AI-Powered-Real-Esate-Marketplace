import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ai-estate-pro-2.preview.emergentagent.com").rstrip("/")

def test_catalog_and_filters():
    r = requests.get(f"{BASE_URL}/api/properties", timeout=20)
    assert r.status_code == 200
    data = r.json()["properties"]
    assert len(data) >= 6 and data[0]["id"] == "p1"
    r = requests.get(f"{BASE_URL}/api/properties", params={"q": "Miami", "type": "Penthouse"}, timeout=20)
    assert r.status_code == 200 and len(r.json()["properties"]) == 1
    assert r.json()["properties"][0]["title"] == "No. 28 Penthouse"

def login(email):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Lumina2026!"}, timeout=20)
    assert r.status_code == 200
    assert r.json()["user"]["email"] == email
    return r.json()["token"]

def test_buyer_auth_saved_and_ai():
    token = login("buyer@lumina.demo")
    h = {"Authorization": f"Bearer {token}"}
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20)
    assert me.status_code == 200 and me.json()["user"]["role"] == "buyer"
    save = requests.post(f"{BASE_URL}/api/me/wishlist/p1", headers=h, timeout=20)
    assert save.status_code == 200 and "p1" in save.json()["wishlist"]
    compare = requests.post(f"{BASE_URL}/api/me/compare/p1", headers=h, timeout=20)
    assert compare.status_code == 200 and "p1" in compare.json()["compare"]
    ai = requests.post(f"{BASE_URL}/api/ai/assistant", json={"prompt": "quiet Villa in Austin under 2 million"}, timeout=20)
    assert ai.status_code == 200 and ai.json()["properties"]

def test_registration_and_seller_entry():
    email = "TEST_reg_lumina@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"name": "Test Lumina", "email": email, "password": "testpass123", "role": "seller"}, timeout=20)
    assert r.status_code == 200 and r.json()["user"]["role"] == "seller"
    token = login("seller@lumina.demo")
    r = requests.get(f"{BASE_URL}/api/dashboard", headers={"Authorization": f"Bearer {token}"}, timeout=20)
    assert r.status_code == 200 and "stats" in r.json()