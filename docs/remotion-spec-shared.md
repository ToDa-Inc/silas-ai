# Promoting `remotion-spec/` to a shared workspace package

> Status: **planned** — short-term drift is guarded by
> `scripts/check-remotion-spec-drift.js`.

## Why

We have two copies of the Remotion spec today, hand-synced:

- `content-machine/src/remotion-spec/` — consumed by the Next.js `<Player>`
  in `components/video-spec-preview.tsx` (live preview in the editor).
- `video-production/broll-caption-editor/src/remotion-spec/` — consumed by
  the standalone Remotion CLI (`render.ts`) that emits the final MP4.

Both trees implement the same `VideoSpec` schema, the same `<Renderer>`,
the same templates and themes. Any drift means the preview lies about what
the rendered MP4 will look like — one of the highest-impact UX bugs we can
ship. Today the drift is mechanical: somebody edits one tree, forgets the
other, the preview and the final render disagree.

The fix is structural: one canonical source of truth that both apps
import.

## Why this isn't already a single package

- `silas-content-system` is not currently a true npm/yarn/pnpm workspace.
  `package.json` at the root only orchestrates dev scripts; both apps have
  their own `node_modules` and lockfiles.
- The Player tree imports types from `@/lib/video-spec` (the Zod-validated
  Studio types). The CLI tree must stay self-contained — Remotion's
  bundler runs without the Next.js path mapping. Today this asymmetry is
  why `schema.ts` diverges (the Player file has a
  `coerceLibVideoSpecForRemotion` helper that depends on the Studio
  types).

## Target layout

```
silas-content-system/
  packages/
    remotion-spec/                    ← new, canonical source of truth
      package.json                    ← name: "@silas/remotion-spec"
      tsconfig.json
      src/
        index.ts                      ← re-exports
        schema.ts                     ← VideoSpec + helpers
        Renderer.tsx
        Background.tsx
        activeLayers.ts
        alignLayout.ts
        animations.ts
        appearance.ts
        layout.ts
        templateProps.ts
        textTreatment.ts
        templates/
        themes/
  content-machine/
    package.json                      ← add "@silas/remotion-spec": "file:../packages/remotion-spec"
  video-production/broll-caption-editor/
    package.json                      ← same
```

## Migration checklist

1. Decide which `schema.ts` is canonical. Suggestion: take the Player
   tree's superset (it has `trimStartSec`, `trimEndSec`, `fontScale` —
   useful for the CLI too) but move `coerceLibVideoSpecForRemotion` out
   of the shared package, since it depends on Studio types. Land that
   helper in `content-machine/src/lib/video-spec.ts`.
2. Move the canonical files to `packages/remotion-spec/src/`.
3. Add a minimal `packages/remotion-spec/package.json` declaring `react`
   and `remotion` as peer dependencies.
4. Wire as a file: dependency in both apps and run install.
5. Update imports in:
   - `content-machine/src/components/video-spec-preview.tsx`
   - `content-machine/src/components/video-create-workspace.tsx`
   - `video-production/broll-caption-editor/src/render.ts`
   - `video-production/broll-caption-editor/remotion.config.ts`
   - any test files that import from the local trees.
6. Delete the two `src/remotion-spec/` directories.
7. Delete `scripts/check-remotion-spec-drift.js` and its CI hook.
8. Run a full smoke render through the CLI and verify the Player still
   renders an identical-looking preview for at least one of each template
   (`bottom-card`, `centered-pop`, `top-banner`, `stacked-cards`).

## Why not now

The migration is mechanically straightforward but requires verifying that
both the Next.js `<Player>` runtime AND the standalone Remotion CLI
bundler resolve the package the same way — Remotion's bundler can be
fussy about file: deps. Doing this in a separate, focused PR (with a
template-by-template render check) is safer than bundling it into a UX
overhaul.

## In the meantime

`scripts/check-remotion-spec-drift.js` fails if the two trees drift on
anything other than the documented mirror comment on line 2 of each file.
Run it as a pre-commit hook or a CI step:

```bash
node scripts/check-remotion-spec-drift.js
```
