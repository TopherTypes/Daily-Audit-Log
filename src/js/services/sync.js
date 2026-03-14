import { normaliseEntry } from "../state/store.js";

export function hasSyncConfigured(settings) {
  return Boolean(settings.workerBaseUrl.trim() && settings.syncKey.trim() && settings.syncSecret.trim());
}

export async function fetchCloudEntries(settings) {
  const url = new URL(`${settings.workerBaseUrl.replace(/\/$/, "")}/sync`);
  url.searchParams.set("syncKey", settings.syncKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { ...(settings.syncSecret ? { "X-Sync-Secret": settings.syncSecret } : {}) }
  });

  if (!response.ok) throw new Error(`Pull failed with status ${response.status}`);

  const data = await response.json();
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return entries.map(normaliseEntry);
}

export async function pushEntriesToCloud(settings, entries) {
  const response = await fetch(`${settings.workerBaseUrl.replace(/\/$/, "")}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(settings.syncSecret ? { "X-Sync-Secret": settings.syncSecret } : {}) },
    body: JSON.stringify({ syncKey: settings.syncKey, entries })
  });

  if (!response.ok) throw new Error(`Push failed with status ${response.status}`);
  return response.json();
}
