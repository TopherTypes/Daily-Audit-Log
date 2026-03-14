import { STORAGE_KEY, SYNC_META_KEY, SYNC_SETTINGS_KEY, FIXED_WORKER_BASE_URL, FIXED_SYNC_KEY } from "../config.js";

export function generateId() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function readEntries() {
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function readSyncSettings() {
  const parsed = safeParse(localStorage.getItem(SYNC_SETTINGS_KEY), {});
  return {
    workerBaseUrl: FIXED_WORKER_BASE_URL,
    syncKey: FIXED_SYNC_KEY,
    syncSecret: parsed.syncSecret || ""
  };
}

export function saveSyncSettings(settings) {
  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify({ syncSecret: settings.syncSecret || "" }));
}

export function readSyncMeta() {
  const parsed = safeParse(localStorage.getItem(SYNC_META_KEY), null);
  if (!parsed) return { lastSyncedAt: "", lastSyncStatus: "never", lastSyncMessage: "" };
  return {
    lastSyncedAt: parsed.lastSyncedAt || "",
    lastSyncStatus: parsed.lastSyncStatus || "never",
    lastSyncMessage: parsed.lastSyncMessage || ""
  };
}

export function saveSyncMeta(meta) {
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

export function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SYNC_META_KEY);
}
