# Vocify OS

Internal morning dashboard mockup for a B2B sales team. It is designed to deploy as a static here.now site with no build pipeline.

## What ships now

- `index.html` contains the complete Alpine.js and Tailwind UI.
- HubSpot data is loaded through one adapter call: `GET /api/hubspot/summary`.
- If that endpoint is unavailable, the app falls back to realistic HubSpot-shaped mock data.
- Initiatives, canvas tasks, and today's focus persist locally in `localStorage` for the browser session.
- `site-data.schema.json` defines the intended here.now Site Data collections.
- `.herenow/proxy.json` documents the live HubSpot proxy boundary.
- `.herenow/config.json` enables SPA mode.

## HubSpot contract

The browser expects `/api/hubspot/summary` to return this normalized shape:

```json
{
  "deals": [
    {
      "id": "deal-123",
      "company": "Acme Inc",
      "name": "Sales workflow pilot",
      "value": 42000,
      "stage": "Proposal",
      "closeDate": "2026-06-30T00:00:00.000Z",
      "owner": "DN",
      "lastActivityDate": "2026-06-18T00:00:00.000Z",
      "nextActivityDate": "2026-06-23T00:00:00.000Z",
      "referenceDate": "2026-06-18T00:00:00.000Z",
      "reason": "Proposal stage",
      "summary": "Short context for the drawer.",
      "isOpen": true
    }
  ],
  "overdueFollowUps": [],
  "followUpsDue": [],
  "meetingsBooked": [],
  "callQueue": []
}
```

Cursor MCP can help inspect HubSpot while building, but the published static app cannot call MCP directly. Live production mode should use either a here.now proxy with a response transform or a tiny server-side summarizer behind `/api/hubspot/summary`.

Live mode is intentionally opt-in to avoid noisy 404s on the published mockup. Enable it by opening the site with `?live=1` or setting `localStorage.setItem("vocify-hubspot-mode", "live")` in the browser console.

## Site Data note

The intended Site Data manifest is kept in `site-data.schema.json`. The current publish path rejected it as an invalid manifest even after reducing it to the documented core fields, so it is not placed at `.herenow/data.json` yet. The app still runs fully as a static mockup because local task state is persisted in `localStorage`.
