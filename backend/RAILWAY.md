# Deploy the FastAPI API on Railway

The **repo root** `Dockerfile` builds the **Next.js** dashboard only. GitHub Actions cron URLs must hit **this Python API**, which exposes `POST /api/v1/cron/sync-all`, `…/keyword-reel-similarity`, `…/niche-discovery`, etc.

## API image layout (single source of truth)

- **Dockerfile:** `backend.Dockerfile` at the **monorepo root** (not inside `backend/`).
- **Build context:** repo root so the image can `COPY video-production/broll-caption-editor` into `/opt/broll-caption-editor` and `COPY backend/` into `/app`.
- **Remotion:** `npm ci` runs in `/opt/broll-caption-editor`. Renders use **Debian `chromium`** (`REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium`) so slim images do not download headless-shell or chase missing `.so` files.
- **Config-as-code:** root `railway.toml` sets `dockerfilePath = "backend.Dockerfile"` for the service that uses it. Adjust in the Railway UI if your API service uses a different config file.

## Production: two services (recommended)

Use **two Railway services in the same project** (same GitHub repo, same `backend.Dockerfile`). Do **not** create a separate Railway project for the worker.

### 1. API service (public)

1. Railway → **New service** (or your existing production service) → same GitHub repo.
2. **Settings → Root Directory** → leave **empty** (repository root).  
   **Do not** set Root Directory to `backend` — the API image needs `video-production/` on the build context.
3. **Settings → Build → Dockerfile path** → `backend.Dockerfile`.
4. **Deploy → Custom Start Command** (override image default):

   ```bash
   python -m uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

   Do **not** use `bash start.sh` here if you run a dedicated worker service — `start.sh` also starts `python worker.py` in the background, which duplicates workers and breaks the “one worker pool” model.

5. **Networking → Public** — enable HTTP. Railway sets `$PORT` (often `8080` in the UI).
6. **Healthcheck Path** → `/health` (see `backend/main.py`).
7. **Variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `APIFY_API_TOKEN`, `OPENROUTER_API_KEY`, `CORS_ORIGINS`, etc.
8. Deploy, then open `https://<api-service-url>/openapi.json` and confirm `/api/v1/cron/…` routes exist.
9. Point **GitHub Actions** secrets at this host (`SYNC_ALL_URL`, `NICHE_DISCOVERY_CRON_URL`, etc.).
10. On the **dashboard** (Vercel) service, set `CONTENT_API_URL` / `NEXT_PUBLIC_CONTENT_API_URL` to this API’s public URL.

### 2. Worker service (background jobs)

1. Railway → **New service** → same repo, same branch, root directory empty, Dockerfile `backend.Dockerfile`.
2. **Deploy → Custom Start Command:**

   ```bash
   python worker.py
   ```

3. **Networking** — public HTTP is optional; the worker only needs outbound HTTPS to Supabase and Apify.
4. **Variables** — copy the same backend env as the API (at minimum `SUPABASE_*`, `APIFY_*`, `OPENROUTER_*`, and any keys your jobs use).

### Apify concurrency slots (Supabase)

`services.apify.run_actor()` acquires a row in `public.apify_run_slots` via RPC before starting an Apify actor.

Apply SQL once in the Supabase SQL Editor:

- [`backend/sql/phase21_apify_run_slots.sql`](sql/phase21_apify_run_slots.sql)

Without this migration, `claim_apify_run_slot` / `release_apify_run_slot` RPCs are missing and actor runs will fail with a clear error after the wait timeout.

### OpenRouter request pacing (Supabase)

Similarity scoring runs with a bounded worker pool (`OPENROUTER_SCORING_WORKERS`, default `4`) and reserves OpenRouter request timestamps globally (`OPENROUTER_REQUESTS_PER_MINUTE`, default `15`) before each chat completion.

Apply SQL once in the Supabase SQL Editor:

- [`backend/sql/phase22_openrouter_rate_limit.sql`](sql/phase22_openrouter_rate_limit.sql)

This keeps 300-reel scoring jobs moving faster than sequential scoring while avoiding account-wide bursts when API and worker services both call OpenRouter.

### Scaling

- Scale **worker** replicas when `background_jobs` backs up (CPU/RAM permitting). The Apify slot limit defaults to `20` in code to leave headroom below the common account cap.
- Keep OpenRouter pacing conservative first: default `15` requests/minute with `4` scoring workers. If real runs show no 429s, raise cautiously.
- Scale **API** replicas based on HTTP load. More API replicas do **not** replace workers unless you still run `start.sh` on API (avoid that in production).

### Local / legacy: API + worker in one container

[`backend/start.sh`](start.sh) runs `python worker.py` in the background and then Uvicorn. Use this only for **local** or temporary single-container deploys — not when a dedicated worker service exists.

## Migrating from the old layout

If your API service used **Root Directory = `backend`** and **`backend/Dockerfile`**, update it to **Root Directory = empty** and **`backend.Dockerfile`**, then redeploy. The previous layout existed only to vendor a copy of the Remotion project; that copy is removed from the repo.

## Remotion source trees (for contributors)

| Location | Role |
|----------|------|
| `video-production/broll-caption-editor/` | **CLI + production render** — only copy baked into the API image. |
| `content-machine/src/remotion-spec/` | **Next.js in-app preview** — must stay in sync with the folder above (see `schema.ts` header comments). |

Long-term cleanup: one shared npm workspace package for `remotion-spec` consumed by both apps.
