"""Auth and tenant-isolation guarantees for the API.

The API talks to Supabase with the service-role key, so org/client scoping lives entirely in
``core.deps`` and the per-route filters. These tests pin that behaviour with an in-memory fake.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from core import deps
from core.database import get_supabase
from main import app
from routers.cron import _require_cron_secret


class _Query:
    def __init__(self, rows: list[dict], log: list[tuple[str, dict]], name: str) -> None:
        self._rows = rows
        self._filters: dict = {}
        self._log = log
        self._name = name

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        self._log.append((self._name, dict(self._filters)))
        data = [r for r in self._rows if all(r.get(k) == v for k, v in self._filters.items())]
        return SimpleNamespace(data=data)


class FakeSupabase:
    def __init__(self, tables: dict[str, list[dict]]) -> None:
        self._tables = tables
        self.queries: list[tuple[str, dict]] = []

    def table(self, name: str) -> _Query:
        return _Query(self._tables.get(name, []), self.queries, name)


TABLES = {
    "profiles": [{"id": "u1", "api_key": "key-a"}],
    "organizations": [{"id": "org-a", "slug": "a"}, {"id": "org-b", "slug": "b"}],
    "organization_members": [{"id": "m1", "user_id": "u1", "org_id": "org-a"}],
    "clients": [
        {"id": "client-a", "org_id": "org-a", "slug": "shared-slug"},
        {"id": "client-b", "org_id": "org-b", "slug": "shared-slug"},
        {"id": "client-b-only", "org_id": "org-b", "slug": "b-only"},
    ],
}
SETTINGS = SimpleNamespace(default_org_slug="")


@pytest.fixture(autouse=True)
def _clear_caches():
    deps._org_cache.clear()
    deps._client_cache.clear()
    yield
    deps._org_cache.clear()
    deps._client_cache.clear()


def _org_access(db: FakeSupabase, *, api_key=None, org_slug=None, authorization=None) -> str:
    return asyncio.run(
        deps.require_org_access(
            SETTINGS, db, x_org_slug=org_slug, x_api_key=api_key, authorization=authorization
        )
    )


def _status(exc: pytest.ExceptionInfo[HTTPException]) -> int:
    return exc.value.status_code


# --- require_org_access -----------------------------------------------------


def test_missing_api_key_is_401():
    with pytest.raises(HTTPException) as exc:
        _org_access(FakeSupabase(TABLES), org_slug="a")
    assert _status(exc) == 401


def test_unknown_api_key_is_401():
    with pytest.raises(HTTPException) as exc:
        _org_access(FakeSupabase(TABLES), api_key="nope", org_slug="a")
    assert _status(exc) == 401


def test_missing_org_slug_is_400():
    with pytest.raises(HTTPException) as exc:
        _org_access(FakeSupabase(TABLES), api_key="key-a")
    assert _status(exc) == 400


def test_unknown_org_is_404():
    with pytest.raises(HTTPException) as exc:
        _org_access(FakeSupabase(TABLES), api_key="key-a", org_slug="missing")
    assert _status(exc) == 404


def test_user_cannot_enter_an_org_they_are_not_a_member_of():
    with pytest.raises(HTTPException) as exc:
        _org_access(FakeSupabase(TABLES), api_key="key-a", org_slug="b")
    assert _status(exc) == 403


def test_member_gets_their_org_id_via_header_or_bearer():
    assert _org_access(FakeSupabase(TABLES), api_key="key-a", org_slug="a") == "org-a"
    deps._org_cache.clear()
    assert _org_access(FakeSupabase(TABLES), authorization="Bearer key-a", org_slug="a") == "org-a"


def test_successful_resolution_is_cached():
    db = FakeSupabase(TABLES)
    _org_access(db, api_key="key-a", org_slug="a")
    first = len(db.queries)
    _org_access(db, api_key="key-a", org_slug="a")
    assert len(db.queries) == first


def test_failed_resolution_is_not_cached():
    db = FakeSupabase(TABLES)
    for _ in range(2):
        with pytest.raises(HTTPException):
            _org_access(db, api_key="key-a", org_slug="b")
    assert not deps._org_cache


# --- resolve_client_id ------------------------------------------------------


def test_client_slug_is_resolved_inside_the_callers_org_only():
    db = FakeSupabase(TABLES)
    # Same slug exists in both orgs: each org must get its own client id.
    assert deps.resolve_client_id("shared-slug", "org-a", db) == "client-a"
    assert deps.resolve_client_id("shared-slug", "org-b", db) == "client-b"


def test_other_orgs_client_is_404_not_leaked():
    with pytest.raises(HTTPException) as exc:
        deps.resolve_client_id("b-only", "org-a", FakeSupabase(TABLES))
    assert _status(exc) == 404


# --- end to end through the real app ---------------------------------------


@pytest.fixture
def client():
    db = FakeSupabase(TABLES)
    app.dependency_overrides[get_supabase] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_member_of_a_cannot_read_org_b_via_header_switch(client):
    res = client.get("/api/v1/clients/b-only", headers={"X-Api-Key": "key-a", "X-Org-Slug": "b"})
    assert res.status_code == 403


def test_member_of_a_cannot_read_org_b_client_by_slug_in_own_org(client):
    res = client.get("/api/v1/clients/b-only", headers={"X-Api-Key": "key-a", "X-Org-Slug": "a"})
    assert res.status_code == 404


# Routes that are intentionally reachable without an API key.
PUBLIC_ROUTES = {
    ("GET", "/health"),
    # Static question list, no tenant data.
    ("GET", "/api/v1/clients/{slug}/onboarding/voice/questions"),
}


def _all_api_routes() -> list[tuple[str, str]]:
    # Read from the OpenAPI schema: newer FastAPI wraps included routers, so app.routes is not flat.
    http_methods = {"get", "post", "put", "patch", "delete"}
    return sorted(
        (method.upper(), path)
        for path, item in app.openapi()["paths"].items()
        for method in item
        if method in http_methods
    )


@pytest.mark.parametrize("method,path", _all_api_routes())
def test_every_route_rejects_requests_without_credentials(client, method, path):
    if (method, path) in PUBLIC_ROUTES:
        pytest.skip("intentionally public")
    concrete = path.replace("{", "").replace("}", "")  # '/clients/{slug}' -> '/clients/slug'
    res = client.request(method, concrete)
    # 401: missing/invalid API key or cron secret; 503: cron secret not configured.
    assert res.status_code in (401, 503), f"{method} {path} -> {res.status_code}"


# --- cron secret ------------------------------------------------------------


def test_cron_secret_unset_is_503():
    with pytest.raises(HTTPException) as exc:
        _require_cron_secret(SimpleNamespace(cron_secret=""), "anything")
    assert _status(exc) == 503


@pytest.mark.parametrize("sent", [None, "", "wrong", "s3cret ", "ünïcode"])
def test_cron_secret_wrong_is_401(sent):
    with pytest.raises(HTTPException) as exc:
        _require_cron_secret(SimpleNamespace(cron_secret="s3cret"), sent)
    assert _status(exc) == 401


def test_cron_secret_correct_passes():
    _require_cron_secret(SimpleNamespace(cron_secret="s3cret"), "s3cret")
