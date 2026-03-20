# Daily Audit Log

## Architecture notes

The app now uses a small frontend module structure under `src/`:

- `src/index.html` contains only the UI markup shell and module/style includes.
- `src/styles/*.css` separates theme tokens, layout rules, component styles, and utility helpers.
- `src/js/app.js` exposes `init()` and acts as the orchestrator that wires modules together.
- `src/js/config.js` contains application constants (localStorage keys and fixed sync configuration).
- `src/js/state/store.js` now exposes a centralized reactive state store (subscribe/notify + action-style updates) and merge utilities.
- `src/js/services/storage.js` handles localStorage reads/writes while preserving existing keys for backward compatibility.
- `src/js/services/sync.js` performs cloud pull/push requests.
- `src/js/services/workflows.js` owns storage/sync side-effect workflows and dispatches state updates.
- `src/js/services/speech.js` encapsulates browser speech recognition state.
- `src/js/ui/render.js` contains scoped renderers (`renderFormState`, `renderEntries`, `renderReview`, `renderSyncStatus`).
- `src/js/ui/events.js` binds DOM events, updates store filters/messages, and wires store subscriptions to scoped renderers.
- `src/js/utils/date.js` and `src/js/utils/csv.js` host pure formatting/export helpers.

### Data flow

`init()` collects DOM references, creates UI handlers, and binds events. Side-effect services hydrate and sync data while dispatching action updates into the centralized store; store subscriptions then re-render only affected UI regions. Sync operations publish optimistic pending/success/error states without freezing unrelated controls.

### UX layout

- `Journal` is now the default focused view with the daily entry form.
- `Review` now opens with a month-by-month audit calendar, including previous/next month navigation and greyed future dates, plus reflection shortcuts and saved entries below.
- `Settings & Sync` and `Data` are split into dedicated tabs and collapse into accordions on mobile.
- A sticky mobile-first save bar keeps `Save entry` available while scrolling.
- The daily audit form supports both reflective text prompts and numeric fields for calorie intake and weight.

## Styling and theming

- `src/styles/tokens.css` now defines the design token system (color, spacing, typography, radius, elevation, motion).
- The app respects `prefers-color-scheme` by default and includes a manual Light/Dark/System theme toggle persisted in localStorage.
- Component and layout styles use shared tokenized states for focus, hover, active, disabled, and subtle reduced-motion-aware transitions.

## GitHub Pages deployment

This repository is now GitHub Pages-ready:

- `index.html` at the repository root redirects to `src/index.html`, which is required because GitHub Pages serves the site entry point from `/index.html`.
- App assets remain in `src/` and continue to load using relative paths.

For a project site, set **Settings → Pages → Build and deployment → Source** to **Deploy from a branch**, then choose your default branch and `/ (root)`.

