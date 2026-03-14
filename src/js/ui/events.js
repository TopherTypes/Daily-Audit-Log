import { todayAsLocalDateString, nowIso, formatYMD, parseYMDToDate, formatDisplayTimestamp } from "../utils/date.js";
import { entriesToCsv } from "../utils/csv.js";
import { readEntries, saveEntries, readSyncSettings, saveSyncSettings, readSyncMeta, saveSyncMeta, clearAllData, generateId } from "../services/storage.js";
import { fetchCloudEntries, hasSyncConfigured, pushEntriesToCloud } from "../services/sync.js";
import { mergeEntries, normaliseEntry, sortEntriesNewestFirst } from "../state/store.js";
import { QUESTION_SCHEMA } from "../config/questions.js";
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

  function setFormFeedback(message, mode = "") {
    elements.formMessage.textContent = message;
    elements.formMessage.classList.remove("success", "error");
    if (mode) elements.formMessage.classList.add(mode);
    if (elements.stickySaveFeedback) elements.stickySaveFeedback.textContent = message || "Entries save locally first, then sync if configured.";
  }

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
    document.querySelectorAll("input, textarea, button, select").forEach(control => {
      if (control.id !== "importJsonInput") control.disabled = disabled;
    });
  }

  // Keep recent-entry filtering centralized so Review and future exports stay consistent.
  function getFilteredEntries(entries) {
    const filterValue = elements.recentFilter?.value || "7";
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    if (filterValue === "custom") {
      const startValue = elements.customStartDate?.value;
      const endValue = elements.customEndDate?.value;
      if (!startValue || !endValue) return [];
      const start = parseYMDToDate(startValue);
      const end = parseYMDToDate(endValue);
      if (start.getTime() > end.getTime()) return [];
      return entries.filter(entry => {
        const entryTime = parseYMDToDate(entry.entryDate).getTime();
        return entryTime >= start.getTime() && entryTime <= end.getTime();
      });
    }

    const days = Number(filterValue);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    cutoff.setHours(0, 0, 0, 0);
    return entries.filter(entry => parseYMDToDate(entry.entryDate).getTime() >= cutoff.getTime());
  }

  function refreshEntries() {
    const entries = sortEntriesNewestFirst(readEntries().map(normaliseEntry));
    renderReviewList(elements.reviewResult, entries.slice(0, 5));
    renderEntries(elements.entriesList, getFilteredEntries(entries));
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

  function resetForm({ preserveFeedback = false } = {}) {
    elements.form.reset();
    elements.entryDate.value = todayAsLocalDateString();
    clearSelectedEnergy();
    if (!preserveFeedback) setFormFeedback("");
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

  function updateCustomDateVisibility() {
    const showCustom = elements.recentFilter?.value === "custom";
    elements.customDateFilters?.classList.toggle("hidden", !showCustom);
    if (elements.customDateFilters) {
      elements.customDateFilters.setAttribute("aria-hidden", String(!showCustom));
    }
  }

  function setActiveTab(tabId) {
    elements.tabButtons.forEach(button => {
      button.classList.toggle("active", button.dataset.tab === tabId);
    });
    elements.tabPanels.forEach(panel => {
      const active = panel.id === tabId;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  // Optional sections stay expanded on desktop, but collapse by default on mobile.
  function syncAccordionMode() {
    const isMobile = window.innerWidth <= 900;
    elements.accordions.forEach(accordion => {
      accordion.open = !isMobile;
    });
  }

  function bind() {
    elements.tabButtons.forEach(button => {
      button.addEventListener("click", () => setActiveTab(button.dataset.tab));
    });

    syncAccordionMode();
    window.addEventListener("resize", syncAccordionMode);

    elements.recentFilter?.addEventListener("change", () => {
      updateCustomDateVisibility();
      refreshEntries();
    });
    elements.customStartDate?.addEventListener("change", refreshEntries);
    elements.customEndDate?.addEventListener("change", refreshEntries);
    updateCustomDateVisibility();

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
      const schemaFieldValues = Object.fromEntries(
        QUESTION_SCHEMA.map(question => {
          const input = elements.questionInputs[question.id];
          if (!input) {
            console.error(`Missing input for schema field "${question.id}".`);
            return [question.id, ""];
          }
          return [question.id, input.value.trim()];
        })
      );

      const entry = normaliseEntry({
        id: generateId(),
        entryDate: elements.entryDate.value,
        createdAt: timestamp,
        lastModified: timestamp,
        energy: getSelectedEnergy(),
        ...schemaFieldValues
      });

      const validationMessage = validateEntry(entry);
      if (validationMessage) {
        setFormFeedback(validationMessage, "error");
        return;
      }

      const localEntries = readEntries().map(normaliseEntry);
      localEntries.push(entry);
      saveEntries(sortEntriesNewestFirst(localEntries));
      refreshEntries();

      if (!hasSyncConfigured(readSyncSettings())) {
        setFormFeedback("Entry saved locally. Cloud sync secret is not configured yet.", "success");
        resetForm({ preserveFeedback: true });
        return;
      }

      try {
        disableUiDuringSync(true);
        await performMergedSync();
        setFormFeedback("Entry saved and synced.", "success");
      } catch (error) {
        saveSyncMeta({ lastSyncedAt: "", lastSyncStatus: "error", lastSyncMessage: error.message });
        updateSyncStatusBox();
        setFormFeedback(`Entry saved locally, but cloud sync failed: ${error.message}`, "error");
      } finally {
        resetForm({ preserveFeedback: true });
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

    document.querySelectorAll("[data-reflection]").forEach(button => button.addEventListener("click", () => showReflection(button.dataset.reflection)));

    return { setSpeechStatus, appendTranscriptToField, resetForm, refreshEntries, loadSyncSettingsIntoForm, updateSyncStatusBox };
  }

  function setSpeechController(nextSpeechController) {
    speechController = nextSpeechController;
  }

  return { bind, refreshEntries, loadSyncSettingsIntoForm, updateSyncStatusBox, setSpeechStatus, appendTranscriptToField, setSpeechController };
}
