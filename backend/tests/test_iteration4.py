"""Iteration 4 backend tests: Live Gemini + Saved Searches + Notifications fanout."""
import os, time, pytest, requests

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split('\n')[0]).rstrip('/')

BUYER = {'email': 'buyer@lumina.demo', 'password': 'Lumina2026!'}
SELLER = {'email': 'seller@lumina.demo', 'password': 'Lumina2026!'}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()['token'], r.json()['user']


@pytest.fixture(scope='module')
def buyer():
    t, u = _login(BUYER)
    return {'token': t, 'user': u, 'h': {'Authorization': f'Bearer {t}'}}


@pytest.fixture(scope='module')
def seller():
    t, u = _login(SELLER)
    return {'token': t, 'user': u, 'h': {'Authorization': f'Bearer {t}'}}


# --- Live Gemini ---
class TestGemini:
    def test_assistant_live_gemini(self):
        r = requests.post(f"{BASE_URL}/api/ai/assistant",
                          json={'prompt': 'quiet home with a garden near LA under $3.5M'}, timeout=45)
        assert r.status_code == 200
        d = r.json()
        assert d.get('source') == 'gemini', f"expected gemini source, got {d.get('source')}; reply={d.get('reply')!r}"
        assert d.get('reply') and len(d['reply']) > 10
        assert isinstance(d.get('properties'), list) and len(d['properties']) >= 1

    def test_analyze_live_gemini(self):
        r = requests.post(f"{BASE_URL}/api/ai/analyze/p1", json={}, timeout=45)
        assert r.status_code == 200
        a = r.json()['analysis']
        assert a['source'] == 'gemini', f"source={a['source']}"
        assert a.get('insight') and 'location and amenity mix' not in a['insight']  # not fallback text
        assert isinstance(a.get('risks'), list) and len(a['risks']) >= 2
        assert a.get('estimatedRange') and a.get('investmentScore') and a.get('valueSignal')


# --- Saved searches ---
class TestSavedSearches:
    created_id = None

    def test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/me/searches", json={'brief': 'x'}, timeout=15)
        assert r.status_code == 401

    def test_empty_returns_400(self, buyer):
        r = requests.post(f"{BASE_URL}/api/me/searches", json={'brief': '', 'filters': {}}, headers=buyer['h'], timeout=15)
        assert r.status_code == 400

    def test_create_returns_matches(self, buyer):
        r = requests.post(f"{BASE_URL}/api/me/searches",
                          json={'brief': 'loft in New York under 2.5M', 'filters': {'type': 'Loft', 'max': 2500000}},
                          headers=buyer['h'], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['search']['id']
        matches = d['matches']
        assert any(m['id'] == 'p5' for m in matches), f"expected p5 (Aster Loft) in matches, got {[m.get('id') for m in matches]}"
        TestSavedSearches.created_id = d['search']['id']

    def test_list_own(self, buyer):
        r = requests.get(f"{BASE_URL}/api/me/searches", headers=buyer['h'], timeout=15)
        assert r.status_code == 200
        ids = [s['id'] for s in r.json()['searches']]
        assert TestSavedSearches.created_id in ids

    def test_seller_isolated(self, seller):
        r = requests.get(f"{BASE_URL}/api/me/searches", headers=seller['h'], timeout=15)
        assert r.status_code == 200
        ids = [s['id'] for s in r.json()['searches']]
        assert TestSavedSearches.created_id not in ids

    def test_matches_endpoint(self, buyer):
        r = requests.get(f"{BASE_URL}/api/me/searches/{TestSavedSearches.created_id}/matches", headers=buyer['h'], timeout=15)
        assert r.status_code == 200
        assert any(m['id'] == 'p5' for m in r.json()['matches'])

    def test_matches_wrong_user(self, seller):
        r = requests.get(f"{BASE_URL}/api/me/searches/{TestSavedSearches.created_id}/matches", headers=seller['h'], timeout=15)
        assert r.status_code == 404

    def test_delete_wrong_user_returns_404(self, seller):
        r = requests.delete(f"{BASE_URL}/api/me/searches/{TestSavedSearches.created_id}", headers=seller['h'], timeout=15)
        assert r.status_code == 404

    def test_delete_bad_id(self, buyer):
        r = requests.delete(f"{BASE_URL}/api/me/searches/does-not-exist", headers=buyer['h'], timeout=15)
        assert r.status_code == 404


# --- Notifications fanout ---
class TestFanout:
    def test_fanout_on_new_property(self, buyer, seller):
        # Mark all read first
        requests.post(f"{BASE_URL}/api/me/notifications/read", headers=buyer['h'], timeout=15)

        # Create a saved search for a Villa under 1.5M
        s = requests.post(f"{BASE_URL}/api/me/searches",
                          json={'brief': 'TEST fanout villa', 'filters': {'type': 'Villa', 'max': 1500000}},
                          headers=buyer['h'], timeout=15).json()
        search_id = s['search']['id']

        # Seller publishes matching property
        prop = {
            'title': 'TEST_Fanout Villa', 'city': 'Austin, TX', 'neighborhood': 'Test',
            'price': 1200000, 'beds': 3, 'baths': 2, 'sqft': 2000, 'type': 'Villa',
            'image': 'https://example.com/x.jpg', 'description': 'test villa', 'tags': ['test']
        }
        r = requests.post(f"{BASE_URL}/api/properties", json=prop, headers=seller['h'], timeout=15)
        assert r.status_code == 200, r.text
        created_prop_id = r.json()['property']['id']

        # small delay for fanout
        time.sleep(1.0)

        # Buyer notifications should include this
        n = requests.get(f"{BASE_URL}/api/me/notifications", headers=buyer['h'], timeout=15)
        assert n.status_code == 200
        d = n.json()
        assert d['unread'] >= 1
        top = d['notifications'][0]
        for f in ['id', 'propertyId', 'propertyTitle', 'propertyImage', 'propertyCity', 'propertyPrice', 'searchName', 'read', 'createdAt']:
            assert f in top, f"missing field {f}"
        assert any(x['propertyId'] == created_prop_id for x in d['notifications'])

        # Seller should NOT receive their own fanout
        sn = requests.get(f"{BASE_URL}/api/me/notifications", headers=seller['h'], timeout=15).json()
        assert not any(x.get('propertyId') == created_prop_id for x in sn['notifications'])

        # Mark all read
        rr = requests.post(f"{BASE_URL}/api/me/notifications/read", headers=buyer['h'], timeout=15)
        assert rr.status_code == 200
        after = requests.get(f"{BASE_URL}/api/me/notifications", headers=buyer['h'], timeout=15).json()
        assert after['unread'] == 0

        # cleanup: delete search
        requests.delete(f"{BASE_URL}/api/me/searches/{search_id}", headers=buyer['h'], timeout=15)


# --- Regression iteration 3 ---
class TestRegression:
    def test_agents_list(self):
        r = requests.get(f"{BASE_URL}/api/agents", timeout=15)
        assert r.status_code == 200 and len(r.json()['agents']) >= 3

    def test_messages_send_and_thread(self, buyer, seller):
        r = requests.post(f"{BASE_URL}/api/messages",
                          json={'recipientId': seller['user']['id'], 'text': 'TEST_iter4 ping', 'propertyId': 'p1'},
                          headers=buyer['h'], timeout=15)
        assert r.status_code == 200
        tid = r.json()['threadId']
        r2 = requests.get(f"{BASE_URL}/api/messages/threads/{tid}", headers=seller['h'], timeout=15)
        assert r2.status_code == 200
        assert any(m['text'] == 'TEST_iter4 ping' for m in r2.json()['messages'])

    def test_property_seller_enrichment(self):
        r = requests.get(f"{BASE_URL}/api/properties/p1", timeout=15)
        assert r.status_code == 200 and r.json()['property']['seller']['profile']
