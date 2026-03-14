import { todayAsLocalDateString, nowIso } from "../utils/date.js";
import { generateId } from "../services/storage.js";

export function normaliseEntry(entry) {
  const createdAt = entry.createdAt || nowIso();
  const lastModified = entry.lastModified || createdAt;

  return {
    id: String(entry.id || generateId()),
    entryDate: String(entry.entryDate || todayAsLocalDateString()),
    createdAt: String(createdAt),
    lastModified: String(lastModified),
    feeling: String(entry.feeling ?? ""),
    energy: String(entry.energy ?? ""),
    mattered: String(entry.mattered ?? ""),
    offCourse: String(entry.offCourse ?? ""),
    supported: String(entry.supported ?? ""),
    remember: String(entry.remember ?? ""),
    needNext: String(entry.needNext ?? "")
  };
}

export function sortEntriesNewestFirst(entries) {
  return [...entries].sort((a, b) => {
    const aTime = new Date(`${a.entryDate}T12:00:00`).getTime();
    const bTime = new Date(`${b.entryDate}T12:00:00`).getTime();
    if (bTime !== aTime) return bTime - aTime;
    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
  });
}

export function mergeEntries(localEntries, cloudEntries) {
  const mergedMap = new Map();

  for (const entry of [...localEntries, ...cloudEntries]) {
    const normalised = normaliseEntry(entry);
    const existing = mergedMap.get(normalised.id);

    if (!existing) {
      mergedMap.set(normalised.id, normalised);
      continue;
    }

    const existingTime = new Date(existing.lastModified || existing.createdAt).getTime();
    const candidateTime = new Date(normalised.lastModified || normalised.createdAt).getTime();
    if (candidateTime >= existingTime) mergedMap.set(normalised.id, normalised);
  }

  return sortEntriesNewestFirst(Array.from(mergedMap.values()));
}

const listeners = new Set();

const state = {
  entries: [],
  syncMeta: { lastSyncedAt: "", lastSyncStatus: "never", lastSyncMessage: "" },
  syncSettings: { workerBaseUrl: "", syncKey: "", syncSecret: "" },
  filters: { recent: "7", customStartDate: "", customEndDate: "" },
  ui: {
    formMessage: { text: "", mode: "" },
    dataMessage: "",
    syncSettingsMessage: "",
    sync: { phase: "idle", message: "", isPending: false }
  }
};

function notify(changedAreas = ["all"]) {
  listeners.forEach(listener => listener(state, changedAreas));
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(state, ["all"]);
  return () => listeners.delete(listener);
}

export const actions = {
  hydrate({ entries, syncMeta, syncSettings }) {
    state.entries = sortEntriesNewestFirst(entries.map(normaliseEntry));
    state.syncMeta = { ...state.syncMeta, ...syncMeta };
    state.syncSettings = { ...state.syncSettings, ...syncSettings };
    notify(["entries", "review", "syncStatus"]);
  },

  setEntries(entries) {
    state.entries = sortEntriesNewestFirst(entries.map(normaliseEntry));
    notify(["entries", "review"]);
  },

  setFilters(filters) {
    state.filters = { ...state.filters, ...filters };
    notify(["entries"]);
  },

  setFormMessage(text, mode = "") {
    state.ui.formMessage = { text, mode };
    notify(["formState"]);
  },

  setDataMessage(message) {
    state.ui.dataMessage = message;
    notify(["formState"]);
  },

  setSyncSettingsMessage(message) {
    state.ui.syncSettingsMessage = message;
    notify(["syncStatus"]);
  },

  setSyncSettings(syncSettings) {
    state.syncSettings = { ...state.syncSettings, ...syncSettings };
    notify(["syncStatus"]);
  },

  setSyncMeta(syncMeta) {
    state.syncMeta = { ...state.syncMeta, ...syncMeta };
    notify(["syncStatus"]);
  },

  setSyncState(syncState) {
    state.ui.sync = { ...state.ui.sync, ...syncState };
    notify(["syncStatus"]);
  }
};
