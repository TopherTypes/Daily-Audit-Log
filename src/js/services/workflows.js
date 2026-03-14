import { nowIso } from "../utils/date.js";
import { actions, mergeEntries, normaliseEntry } from "../state/store.js";
import { clearAllData, readEntries, readSyncMeta, readSyncSettings, saveEntries, saveSyncMeta, saveSyncSettings } from "./storage.js";
import { fetchCloudEntries, hasSyncConfigured, pushEntriesToCloud } from "./sync.js";

export function hydrateFromStorage() {
  actions.hydrate({
    entries: readEntries().map(normaliseEntry),
    syncMeta: readSyncMeta(),
    syncSettings: readSyncSettings()
  });
}

export function persistSyncSecret(syncSecret) {
  saveSyncSettings({ syncSecret });
  actions.setSyncSettings(readSyncSettings());
  actions.setSyncSettingsMessage("Sync secret saved on this device.");
}

export function saveLocalEntries(entries) {
  saveEntries(entries);
  actions.setEntries(entries);
}

export function clearLocalData() {
  clearAllData();
  actions.setEntries([]);
  actions.setSyncMeta({ lastSyncedAt: "", lastSyncStatus: "never", lastSyncMessage: "" });
}

export function setSyncError(message) {
  const meta = { lastSyncedAt: "", lastSyncStatus: "error", lastSyncMessage: message };
  saveSyncMeta(meta);
  actions.setSyncMeta(meta);
}

export async function performMergedSync() {
  const settings = readSyncSettings();
  if (!hasSyncConfigured(settings)) throw new Error("Cloud sync secret is missing.");

  actions.setSyncState({ isPending: true, phase: "pulling", message: "Pulling cloud data…" });
  const localEntries = readEntries().map(normaliseEntry);
  const cloudEntries = await fetchCloudEntries(settings);

  actions.setSyncState({ phase: "merging", message: "Merging local and cloud entries…" });
  const merged = mergeEntries(localEntries, cloudEntries);
  saveEntries(merged);
  actions.setEntries(merged);

  actions.setSyncState({ phase: "pushing", message: "Pushing merged data back to cloud…" });
  await pushEntriesToCloud(settings, merged);

  const meta = { lastSyncedAt: nowIso(), lastSyncStatus: "success", lastSyncMessage: "" };
  saveSyncMeta(meta);
  actions.setSyncMeta(meta);
  actions.setSyncState({ isPending: false, phase: "success", message: "Sync complete." });
  return merged;
}

export function finishSyncPhase() {
  actions.setSyncState({ isPending: false, phase: "idle", message: "" });
}
