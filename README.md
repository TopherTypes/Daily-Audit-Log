# Daily Audit Log

## Architecture notes

The app now uses a small frontend module structure under `src/`:

- `src/index.html` contains only the UI markup shell and module/style includes.
- `src/styles/*.css` separates theme tokens, layout rules, component styles, and utility helpers.
- `src/js/app.js` exposes `init()` and acts as the orchestrator that wires modules together.
- `src/js/config.js` contains application constants (localStorage keys and fixed sync configuration).
- `src/js/state/store.js` handles entry normalization, sorting, and merge conflict resolution.
- `src/js/services/storage.js` handles localStorage reads/writes while preserving existing keys for backward compatibility.
- `src/js/services/sync.js` performs cloud pull/push requests.
- `src/js/services/speech.js` encapsulates browser speech recognition state.
- `src/js/ui/render.js` renders entry/review UI fragments.
- `src/js/ui/events.js` binds DOM events and coordinates calls into services/state/render modules.
- `src/js/utils/date.js` and `src/js/utils/csv.js` host pure formatting/export helpers.

### Data flow

`init()` collects DOM references, creates UI handlers, attaches speech callbacks, binds events, and performs initial rendering. Event handlers read/write local data through `storage.js`, transform/merge through `store.js`, call sync APIs through `sync.js`, and then re-render through `render.js`.
