#!/usr/bin/env python3
"""
Batch-ingest curated Instagram reel/post URLs via the Content Machine API.

Calls POST /api/v1/clients/{slug}/reels/analyze-bulk (max 20 URLs per request),
polls GET /api/v1/jobs/{job_id}, then optionally resolves owner handles from
GET /api/v1/clients/{slug}/reels/{reel_id}/analysis.

Environment (repo root .env optional via python-dotenv):
  CONTENT_API_URL / SILAS_API_URL   — API base, e.g. https://….railway.app (no /api/v1 suffix)
  TEST_ACCOUNT_API_KEY / SILAS_API_KEY / X_API_KEY — profiles.api_key
  SILAS_ORG_SLUG / ORG_SLUG         — X-Org-Slug (optional if --resolve-org)
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — only for --resolve-org

Usage:
  cd silas-content-system
  python3 scripts/ingest_competitor_reel_urls.py \\
    --file competitor_list.md --client-slug conny-gfrerer --resolve-org

  python3 scripts/ingest_competitor_reel_urls.py \\
    --file competitor_list.md --client-slug conny-gfrerer --org-slug my-workspace --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv

    _repo_root = Path(__file__).resolve().parent.parent
    load_dotenv(_repo_root / ".env")
    load_dotenv(_repo_root / "config" / ".env")
except ImportError:
    pass

IG_LINE_RE = re.compile(
    r"https?://(?:www\.)?instagram\.com/(?:reel|reels|p|tv)/[^\s)\]\"'<>]+",
    re.IGNORECASE,
)

VALID_PATH_RE = re.compile(
    r"instagram\.com/(?:reel|reels|p|tv)(?:/|$)", re.IGNORECASE
)

BULK_MAX = 20


def canonical_post_url(url: str) -> str:
    return str(url).strip().split("?")[0].split("#")[0].rstrip("/")


def extract_urls(text: str) -> list[str]:
    seen: dict[str, None] = {}
    out: list[str] = []
    for m in IG_LINE_RE.finditer(text):
        raw = m.group(0).rstrip(").,;]")
        if not VALID_PATH_RE.search(raw):
            continue
        key = canonical_post_url(raw)
        if not key or key in seen:
            continue
        seen[key] = None
        out.append(raw.strip())
    return out


def api_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
    timeout: int = 120,
) -> tuple[int, Any]:
    data = None
    h = dict(headers)
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        data = payload
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return resp.status, None
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(err_body) if err_body else None
        except json.JSONDecodeError:
            parsed = err_body
        return e.code, parsed


def resolve_org_slug_from_api_key(api_key: str) -> str:
    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    service_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_url or not service_key:
        sys.exit(
            "--resolve-org requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment."
        )
    q_profile = urllib.parse.quote(f"eq.{api_key}")
    url = f"{supabase_url}/rest/v1/profiles?api_key={q_profile}&select=id"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    code, data = api_request("GET", url, headers=headers, timeout=60)
    if code != 200 or not isinstance(data, list) or not data:
        sys.exit(f"Could not resolve profile for api_key (HTTP {code}): {data}")
    user_id = data[0].get("id")
    if not user_id:
        sys.exit("profiles row missing id")

    q_mem = urllib.parse.quote(f"eq.{user_id}")
    url2 = (
        f"{supabase_url}/rest/v1/organization_members?"
        f"user_id={q_mem}&select=organizations(slug)"
    )
    code2, data2 = api_request("GET", url2, headers=headers, timeout=60)
    if code2 != 200 or not isinstance(data2, list) or not data2:
        sys.exit(f"Could not resolve organization_members (HTTP {code2}): {data2}")

    slugs: list[str] = []
    for row in data2:
        org = row.get("organizations")
        if isinstance(org, dict) and org.get("slug"):
            slugs.append(str(org["slug"]))

    if not slugs:
        sys.exit("No organization slug found for this user.")
    if len(slugs) > 1:
        print(
            f"Warning: multiple orgs for this API key: {slugs}. Using first: {slugs[0]}",
            file=sys.stderr,
        )
    return slugs[0]


def poll_job(
    api_v1: str,
    headers: dict[str, str],
    job_id: str,
    *,
    timeout_s: int,
    interval_s: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    url = f"{api_v1}/jobs/{job_id}"
    while time.monotonic() < deadline:
        code, data = api_request("GET", url, headers=headers, timeout=120)
        if code != 200:
            print(f"Poll job {job_id}: HTTP {code} {data}", file=sys.stderr)
            time.sleep(interval_s)
            continue
        if not isinstance(data, dict):
            time.sleep(interval_s)
            continue
        st = data.get("status")
        if st in ("completed", "failed"):
            return data
        time.sleep(interval_s)
    sys.exit(f"Timeout waiting for job {job_id}")


def fetch_owner_for_reel(
    api_v1: str,
    headers: dict[str, str],
    client_slug: str,
    reel_id: str,
) -> str | None:
    url = f"{api_v1}/clients/{urllib.parse.quote(client_slug)}/reels/{urllib.parse.quote(reel_id)}/analysis"
    code, data = api_request("GET", url, headers=headers, timeout=60)
    if code != 200 or not isinstance(data, dict):
        return None
    o = data.get("owner_username")
    return str(o).strip().lower() if o else None


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest competitor reel URLs via analyze-bulk.")
    parser.add_argument(
        "--file",
        "-f",
        type=Path,
        required=True,
        help="Markdown/text file containing Instagram reel/post URLs",
    )
    parser.add_argument("--client-slug", required=True, help="Client slug, e.g. conny-gfrerer")
    parser.add_argument(
        "--api-base",
        default=os.environ.get("CONTENT_API_URL")
        or os.environ.get("SILAS_API_URL")
        or "http://127.0.0.1:8787",
        help="FastAPI base URL without /api/v1",
    )
    parser.add_argument(
        "--org-slug",
        default=os.environ.get("SILAS_ORG_SLUG") or os.environ.get("ORG_SLUG") or "",
        help="X-Org-Slug (optional if DEFAULT_ORG_SLUG is set on API or --resolve-org)",
    )
    parser.add_argument(
        "--resolve-org",
        action="store_true",
        help="Resolve X-Org-Slug via Supabase using TEST_ACCOUNT_API_KEY (needs service role in env)",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("TEST_ACCOUNT_API_KEY")
        or os.environ.get("SILAS_API_KEY")
        or os.environ.get("X_API_KEY")
        or "",
        help="profiles.api_key (default from TEST_ACCOUNT_API_KEY)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only print URL batches, no API calls")
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N URLs (0 = all)",
    )
    parser.add_argument(
        "--skip-apify",
        action="store_true",
        help="Pass skip_apify=true (requires rows already in DB; usually not for fresh URLs)",
    )
    parser.add_argument(
        "--poll-timeout",
        type=int,
        default=7200,
        help="Max seconds to wait per bulk job (default 2h)",
    )
    parser.add_argument(
        "--owners",
        action="store_true",
        help="After each batch, fetch owner_username per successful reel_id",
    )
    args = parser.parse_args()

    api_key = args.api_key.strip()
    if not api_key and not args.dry_run:
        sys.exit("Missing API key: set TEST_ACCOUNT_API_KEY or pass --api-key")

    text = args.file.read_text(encoding="utf-8", errors="replace")
    urls = extract_urls(text)
    if args.limit and args.limit > 0:
        urls = urls[: args.limit]

    if not urls:
        sys.exit(f"No Instagram reel/post URLs found in {args.file} (file empty or unsaved?)")

    batches = [urls[i : i + BULK_MAX] for i in range(0, len(urls), BULK_MAX)]
    print(f"Found {len(urls)} unique URLs in {len(batches)} batch(es) (max {BULK_MAX} per batch).")

    if args.dry_run:
        for i, b in enumerate(batches, 1):
            print(f"\n--- batch {i} ({len(b)} urls) ---")
            for u in b:
                print(u)
        return

    base = args.api_base.strip().rstrip("/")
    api_v1 = f"{base}/api/v1"

    org_slug = args.org_slug.strip()
    if args.resolve_org:
        org_slug = resolve_org_slug_from_api_key(api_key)
        print(f"Resolved org slug: {org_slug}")
    headers: dict[str, str] = {"X-Api-Key": api_key}
    if org_slug:
        headers["X-Org-Slug"] = org_slug

    all_owners: dict[str, None] = {}
    total_ok = total_fail = 0

    for bi, batch in enumerate(batches, 1):
        print(f"\n>>> Batch {bi}/{len(batches)} — POST analyze-bulk ({len(batch)} urls)")
        url = f"{api_v1}/clients/{urllib.parse.quote(args.client_slug)}/reels/analyze-bulk"
        code, data = api_request(
            "POST",
            url,
            headers=headers,
            body={"urls": batch, "skip_apify": args.skip_apify},
            timeout=180,
        )
        if code == 409:
            print(
                "409: Another reel analysis job is running for this client. "
                "Wait for it to finish, then re-run (URLs already processed are safe to retry).",
                file=sys.stderr,
            )
            sys.exit(1)
        if code != 200 or not isinstance(data, dict):
            sys.exit(f"analyze-bulk failed HTTP {code}: {data}")

        job_id = data.get("job_id")
        if not job_id:
            sys.exit(f"No job_id in response: {data}")

        print(f"    job_id={job_id} — polling…")
        job = poll_job(api_v1, headers, job_id, timeout_s=args.poll_timeout, interval_s=5.0)
        if job.get("status") == "failed":
            print(f"Job failed: {job.get('error_message')}", file=sys.stderr)
            sys.exit(1)

        result = job.get("result") or {}
        if not isinstance(result, dict):
            sys.exit(f"Unexpected job result: {result}")

        items = result.get("items") or []
        for it in items:
            if not isinstance(it, dict):
                continue
            if it.get("ok"):
                total_ok += 1
                rid = it.get("reel_id")
                if args.owners and rid:
                    owner = fetch_owner_for_reel(api_v1, headers, args.client_slug, str(rid))
                    if owner:
                        all_owners.setdefault(owner, None)
                        print(f"    ok {it.get('url')} → @{owner}")
                    else:
                        print(f"    ok {it.get('url')} (could not fetch owner)")
                else:
                    print(f"    ok {it.get('url')}")
            else:
                total_fail += 1
                print(f"    FAIL {it.get('url')} — {it.get('error')}")

        print(
            f"    batch summary: succeeded={result.get('succeeded')} failed={result.get('failed')} "
            f"total={result.get('total')}"
        )

    print(f"\nDone. URLs succeeded={total_ok} failed={total_fail}")
    if args.owners and all_owners:
        owners_sorted = sorted(all_owners.keys())
        print(f"\nDistinct owners this run ({len(owners_sorted)}):")
        for o in owners_sorted:
            print(o)


if __name__ == "__main__":
    main()
