---
name: Motion export constraint
description: Why StrokeYourBrush uses browser-native motion export instead of a GIF package.
---

StrokeYourBrush should prefer browser-native canvas capture and MediaRecorder for local motion export unless a dependency can be installed directly into the artifact workspace.

**Why:** The package-management helper attempted to add a GIF encoder at the workspace root and pnpm rejected it rather than changing the root dependency set. A browser-native export keeps the app offline-friendly and avoids coupling the creative tool to a backend or a root-level package.

**How to apply:** If a future iteration adds a GIF encoder, install it in the `@workspace/stroke-your-brush` package rather than the monorepo root, then preserve the existing WebM fallback.