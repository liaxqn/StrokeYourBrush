# StrokeYourBrush

StrokeYourBrush is a client-side creative studio for drawing alive wiggly marks and turning sketches into short frame animations.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/stroke-your-brush/src/App.tsx` — landing page, drawing workspace, animation workspace, canvas rendering, local persistence, and exports.
- `artifacts/stroke-your-brush/src/index.css` — shared visual language, typography, motion, and responsive workspace styling.
- `artifacts/stroke-your-brush/.replit-artifact/artifact.toml` — web artifact routing and workflow metadata.

## Architecture decisions

- Drawing data is stored as stroke points and serialized to JSON, keeping the app editable and portable without a backend.
- The draw and animate modes share the same canvas/stroke model so brush behavior, selection, color, zoom, and export stay consistent.
- Wiggly rendering is a requestAnimationFrame loop over stored points; the source stroke remains stable for undo, duplication, and reload.
- Motion export uses the browser's MediaRecorder/canvas capture path to keep export local and offline-friendly.

## Product

- Landing page with direct navigation into Draw and Animate modes.
- Draw mode with eight animated brush personalities, saved palette swatches, patterned paper presets, zoom, undo/redo, eraser, lasso selection, duplicate/delete, sound toggle, PNG/WebM/JSON export, and local autosave.
- Animate mode with frame timeline, add/delete/duplicate-style workflow, playback, onion skinning, dedicated non-wiggly frame brushes, PNG/WebM/JSON export, and layers panel.
- Portrait phone layouts keep tools close to the canvas while placing the color wheel and layers in a right-side inspector rail; “Save wiggle” downloads the animated canvas as a WebM file for viewing on-device.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
