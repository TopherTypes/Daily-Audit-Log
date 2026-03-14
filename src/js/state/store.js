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
