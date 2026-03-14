import { todayAsLocalDateString, nowIso, formatYMD, parseYMDToDate, formatDisplayTimestamp } from "../utils/date.js";
import { entriesToCsv } from "../utils/csv.js";
import { readEntries, saveEntries, readSyncSettings, saveSyncSettings, readSyncMeta, saveSyncMeta, clearAllData, generateId } from "../services/storage.js";
import { fetchCloudEntries, hasSyncConfigured, pushEntriesToCloud } from "../services/sync.js";
import { mergeEntries, normaliseEntry, sortEntriesNewestFirst } from "../state/store.js";
import { renderEntries, renderReviewList, renderReflectionResult } from "./render.js";

function getSelectedEnergy() {
  const checked = document.querySelector('input[name="energy"]:checked');
  return checked ? checked.value : "";
}

function clearSelectedEnergy() {
  document.querySelectorAll('input[name="energy"]').forEach(radio => { radio.checked = false; });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function validateEntry(entry) {
  if (!entry.entryDate) return "Please choose a date.";
  if (!entry.energy) return "Please select an energy rating.";
  return "";
}

function appendTranscriptToField(fieldId, transcript) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) return;
  const current = field.value.trim();
  field.value = current.length === 0 ? trimmedTranscript : `${field.value}${/[ \n]$/.test(field.value) ? "" : " "}${trimmedTranscript}`;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
}

export function createUiHandlers(elements) {
  let speechController = { disarmSpeech: () => {} };
  function setSpeechStatus(message, mode = "") {
    elements.speechStatus.textContent = message;
    elements.speechStatus.classList.remove("active", "success");
    if (mode) elements.speechStatus.classList.add(mode);
  }

  function showSyncOverlay(message = "Please wait while your entries are merged and synced.") {
    elements.syncOverlayMessage.textContent = message;
    elements.syncOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function hideSyncOverlay() {
    elements.syncOverlay.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function disableUiDuringSync(disabled) {
    document.querySelectorAll("input, textarea, button").forEach(control => {
      if (control.id !== "importJsonInput") control.disabled = disabled;
    });
  }

  function refreshEntries() {
    const entries = sortEntriesNewestFirst(readEntries().map(normaliseEntry));
    renderEntries(elements.entriesList, entries);
    renderReviewList(elements.reviewResult, entries.slice(0, 5));
  }

  function loadSyncSettingsIntoForm() {
    const settings = readSyncSettings();
    elements.workerBaseUrlInput.value = settings.workerBaseUrl;
    elements.syncKeyInput.value = settings.syncKey;
    elements.syncSecretInput.value = settings.syncSecret;
  }

  function updateSyncStatusBox() {
    const meta = readSyncMeta();
    elements.syncStatusBox.classList.remove("success", "error");
    if (meta.lastSyncStatus === "success") {
      elements.syncStatusBox.classList.add("success");
      elements.syncStatusBox.textContent = meta.lastSyncedAt ? `Last synced: ${formatDisplayTimestamp(meta.lastSyncedAt)}` : "Last sync succeeded.";
    } else if (meta.lastSyncStatus === "error") {
      elements.syncStatusBox.classList.add("error");
      elements.syncStatusBox.textContent = meta.lastSyncMessage ? `Sync failed: ${meta.lastSyncMessage}` : "Last sync failed.";
    } else {
      elements.syncStatusBox.textContent = "Cloud sync not configured yet.";
    }
  }

  async function performMergedSync() {
    const settings = readSyncSettings();
    if (!hasSyncConfigured(settings)) throw new Error("Cloud sync secret is missing.");

    showSyncOverlay("Pulling cloud data…");
    const localEntries = readEntries().map(normaliseEntry);
    const cloudEntries = await fetchCloudEntries(settings);

    showSyncOverlay("Merging local and cloud entries…");
    const merged = mergeEntries(localEntries, cloudEntries);
    saveEntries(merged);
    refreshEntries();

    showSyncOverlay("Pushing merged data back to cloud…");
    await pushEntriesToCloud(settings, merged);

    saveSyncMeta({ lastSyncedAt: nowIso(), lastSyncStatus: "success", lastSyncMessage: "" });
    updateSyncStatusBox();
    return merged;
  }

  function resetForm() {
    elements.form.reset();
    elements.entryDate.value = todayAsLocalDateString();
    clearSelectedEnergy();
    elements.formMessage.textContent = "";
    speechController.disarmSpeech(false);
  }

  function showReflection(kind) {
    const target = new Date();
    target.setHours(12, 0, 0, 0);
    if (kind === "week") target.setDate(target.getDate() - 7);
    if (kind === "month") target.setMonth(target.getMonth() - 1);
    if (kind === "year") target.setFullYear(target.getFullYear() - 1);

    const targetDateString = formatYMD(target);
    const targetTime = parseYMDToDate(targetDateString).getTime();
    const entries = readEntries().map(normaliseEntry);
    let best = null;
    let bestDistance = Infinity;
    for (const entry of entries) {
      const distance = Math.abs(parseYMDToDate(entry.entryDate).getTime() - targetTime);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    }

    renderReflectionResult(elements.reviewResult, kind, targetDateString, best);
  }

  function bind() {
    elements.saveSyncSettingsBtn.addEventListener("click", () => {
      saveSyncSettings({ syncSecret: elements.syncSecretInput.value.trim() });
      elements.syncSettingsMessage.textContent = "Sync secret saved on this device.";
      updateSyncStatusBox();
    });

    elements.pullFromCloudBtn.addEventListener("click", async () => {
      try {
        disableUiDuringSync(true);
        const merged = await performMergedSync();
        elements.syncSettingsMessage.textContent = `Pulled and merged ${merged.length} entries.`;
      } catch (error) {
        saveSyncMeta({ lastSyncedAt: "", lastSyncStatus: "error", lastSyncMessage: error.message });
        updateSyncStatusBox();
        elements.syncSettingsMessage.textContent = error.message;
      } finally {
        disableUiDuringSync(false);
        hideSyncOverlay();
      }
    });

    elements.form.addEventListener("submit", async event => {
      event.preventDefault();
      const timestamp = nowIso();
      const entry = normaliseEntry({
        id: generateId(),
        entryDate: elements.entryDate.value,
        createdAt: timestamp,
        lastModified: timestamp,
        feeling: elements.feeling.value.trim(),
        energy: getSelectedEnergy(),
        mattered: elements.mattered.value.trim(),
        offCourse: elements.offCourse.value.trim(),
        supported: elements.supported.value.trim(),
        remember: elements.remember.value.trim(),
        needNext: elements.needNext.value.trim()
      });

      const validationMessage = validateEntry(entry);
      if (validationMessage) {
        elements.formMessage.textContent = validationMessage;
        return;
      }

      const localEntries = readEntries().map(normaliseEntry);
      localEntries.push(entry);
      saveEntries(sortEntriesNewestFirst(localEntries));
      refreshEntries();

      if (!hasSyncConfigured(readSyncSettings())) {
        elements.formMessage.textContent = "Entry saved locally. Cloud sync secret is not configured yet.";
        resetForm();
        return;
      }

      try {
        disableUiDuringSync(true);
        await performMergedSync();
        elements.formMessage.textContent = "Entry saved and synced.";
      } catch (error) {
        saveSyncMeta({ lastSyncedAt: "", lastSyncStatus: "error", lastSyncMessage: error.message });
        updateSyncStatusBox();
        elements.formMessage.textContent = `Entry saved locally, but cloud sync failed: ${error.message}`;
      } finally {
        resetForm();
        disableUiDuringSync(false);
        hideSyncOverlay();
      }
    });

    elements.resetFormBtn.addEventListener("click", resetForm);

    elements.exportJsonBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(readEntries(), null, 2)], { type: "application/json" });
      downloadBlob(blob, `daily-audit-backup-${todayAsLocalDateString()}.json`);
      elements.dataMessage.textContent = "JSON export downloaded.";
    });

    elements.exportCsvBtn.addEventListener("click", () => {
      const entries = sortEntriesNewestFirst(readEntries());
      if (entries.length === 0) {
        elements.dataMessage.textContent = "No entries to export.";
        return;
      }
      const blob = new Blob([entriesToCsv(entries)], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `daily-audit-export-${todayAsLocalDateString()}.csv`);
      elements.dataMessage.textContent = "CSV export downloaded.";
    });

    elements.importJsonTrigger.addEventListener("click", () => elements.importJsonInput.click());
    elements.importJsonInput.addEventListener("change", event => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!Array.isArray(parsed)) throw new Error("Imported JSON is not an array.");
          const cleaned = parsed.filter(item => item && typeof item === "object").map(normaliseEntry);
          saveEntries(sortEntriesNewestFirst(cleaned));
          refreshEntries();
          elements.dataMessage.textContent = `Imported ${cleaned.length} entries from JSON.`;
        } catch {
          elements.dataMessage.textContent = "Import failed. That JSON appears to be malformed or in the wrong shape.";
        } finally {
          elements.importJsonInput.value = "";
        }
      };
      reader.readAsText(file);
    });

    elements.clearDataBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Clear all saved entries from this browser? This cannot be undone unless you have exported a backup.");
      if (!confirmed) return;
      clearAllData();
      refreshEntries();
      updateSyncStatusBox();
      elements.dataMessage.textContent = "All local data cleared.";
    });

    elements.showRecentBtn.addEventListener("click", () => renderReviewList(elements.reviewResult, sortEntriesNewestFirst(readEntries()).slice(0, 5)));
    document.querySelectorAll("[data-reflection]").forEach(button => button.addEventListener("click", () => showReflection(button.dataset.reflection)));

    return { setSpeechStatus, appendTranscriptToField, resetForm, refreshEntries, loadSyncSettingsIntoForm, updateSyncStatusBox };
  }

  function setSpeechController(nextSpeechController) {
    speechController = nextSpeechController;
  }

  return { bind, refreshEntries, loadSyncSettingsIntoForm, updateSyncStatusBox, setSpeechStatus, appendTranscriptToField, setSpeechController };
}
