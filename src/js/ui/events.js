import { todayAsLocalDateString, nowIso, formatYMD, parseYMDToDate } from "../utils/date.js";
import { entriesToCsv } from "../utils/csv.js";
import { readEntries, readSyncSettings, generateId, saveEntries } from "../services/storage.js";
import { hasSyncConfigured } from "../services/sync.js";
import { actions, getState, normaliseEntry, sortEntriesNewestFirst, subscribe } from "../state/store.js";
import { QUESTION_SCHEMA } from "../config/questions.js";
import { THEME_PREFERENCE_KEY } from "../config.js";
import { clearLocalData, finishSyncPhase, hydrateFromStorage, performMergedSync, persistSyncSecret, setSyncError } from "../services/workflows.js";
import { renderEntries, renderFormState, renderReflectionResult, renderReview, renderSyncStatus } from "./render.js";

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

export function filterEntries(entries, filters) {
  const filterValue = filters.recent || "7";
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  if (filterValue === "custom") {
    if (!filters.customStartDate || !filters.customEndDate) return [];
    const start = parseYMDToDate(filters.customStartDate);
    const end = parseYMDToDate(filters.customEndDate);
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

export function createUiHandlers(elements) {
  let speechController = { disarmSpeech: () => {} };
  const liveRegionMemory = { save: "", sync: "", speech: "" };

  function announceLive(region, message) {
    const element = region === "save" ? elements.saveLiveRegion : region === "sync" ? elements.syncLiveRegion : elements.speechLiveRegion;
    if (!element || !message || liveRegionMemory[region] === message) return;
    liveRegionMemory[region] = message;
    element.textContent = "";
    window.setTimeout(() => {
      element.textContent = message;
    }, 30);
  }

  function applyThemePreference(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
      window.localStorage.setItem(THEME_PREFERENCE_KEY, theme);
      if (elements.themeToggleBtn) {
        elements.themeToggleBtn.dataset.theme = theme;
        elements.themeToggleBtn.textContent = `Theme: ${theme === "dark" ? "Dark" : "Light"}`;
      }
      return;
    }

    document.documentElement.removeAttribute("data-theme");
    window.localStorage.removeItem(THEME_PREFERENCE_KEY);
    if (elements.themeToggleBtn) {
      elements.themeToggleBtn.dataset.theme = "system";
      elements.themeToggleBtn.textContent = "Theme: System";
    }
  }

  function setupThemeToggle() {
    if (!elements.themeToggleBtn) return;

    const stored = window.localStorage.getItem(THEME_PREFERENCE_KEY);
    applyThemePreference(stored === "light" || stored === "dark" ? stored : "system");

    const order = ["system", "light", "dark"];
    elements.themeToggleBtn.addEventListener("click", () => {
      const current = elements.themeToggleBtn.dataset.theme || "system";
      const next = order[(order.indexOf(current) + 1) % order.length];
      applyThemePreference(next);
      announceLive("save", `Theme changed to ${next}.`);
    });
  }

  function setSpeechStatus(message, mode = "", { announce = true } = {}) {
    elements.speechStatus.textContent = message;
    elements.speechStatus.classList.remove("active", "success");
    if (mode) elements.speechStatus.classList.add(mode);
    if (announce) announceLive("speech", message);
  }

  function resetForm({ preserveFeedback = false } = {}) {
    elements.form.reset();
    elements.entryDate.value = todayAsLocalDateString();
    clearSelectedEnergy();
    if (!preserveFeedback) actions.setFormMessage("");
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
    const entries = getState().entries;
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
    if (elements.customDateFilters) elements.customDateFilters.setAttribute("aria-hidden", String(!showCustom));
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

  function syncAccordionMode() {
    const isMobile = window.innerWidth <= 900;
    elements.accordions.forEach(accordion => {
      accordion.open = !isMobile;
    });
  }

  function bindStateToRenderers() {
    subscribe((state, changedAreas) => {
      if (changedAreas.includes("all") || changedAreas.includes("formState")) {
        renderFormState(elements, state);
        if (state.ui.formMessage.text) announceLive("save", state.ui.formMessage.text);
      }

      if (changedAreas.includes("all") || changedAreas.includes("entries")) {
        renderEntries(elements, filterEntries(state.entries, state.filters));
      }

      if (changedAreas.includes("all") || changedAreas.includes("review")) {
        renderReview(elements, state.entries);
      }

      if (changedAreas.includes("all") || changedAreas.includes("syncStatus")) {
        renderSyncStatus(elements, state);
        const message = state.ui.syncSettingsMessage || state.ui.sync.message;
        if (message) announceLive("sync", message);
      }
    });
  }

  function bind() {
    setupThemeToggle();
    bindStateToRenderers();
    hydrateFromStorage();

    elements.tabButtons.forEach(button => {
      button.addEventListener("click", () => setActiveTab(button.dataset.tab));
    });

    syncAccordionMode();
    window.addEventListener("resize", syncAccordionMode);

    elements.recentFilter?.addEventListener("change", () => {
      updateCustomDateVisibility();
      actions.setFilters({ recent: elements.recentFilter.value });
    });
    elements.customStartDate?.addEventListener("change", () => actions.setFilters({ customStartDate: elements.customStartDate.value }));
    elements.customEndDate?.addEventListener("change", () => actions.setFilters({ customEndDate: elements.customEndDate.value }));
    updateCustomDateVisibility();

    elements.saveSyncSettingsBtn.addEventListener("click", () => {
      persistSyncSecret(elements.syncSecretInput.value.trim());
    });

    elements.pullFromCloudBtn.addEventListener("click", async () => {
      try {
        const merged = await performMergedSync();
        actions.setSyncSettingsMessage(`Pulled and merged ${merged.length} entries.`);
      } catch (error) {
        setSyncError(error.message);
        actions.setSyncSettingsMessage(error.message);
      } finally {
        finishSyncPhase();
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
        actions.setFormMessage(validationMessage, "error");
        return;
      }

      const localEntries = readEntries().map(normaliseEntry);
      localEntries.push(entry);
      const sortedEntries = sortEntriesNewestFirst(localEntries);
      saveEntries(sortedEntries);
      actions.setEntries(sortedEntries);

      if (!hasSyncConfigured(readSyncSettings())) {
        actions.setFormMessage("Entry saved locally. Cloud sync secret is not configured yet.", "success");
        resetForm({ preserveFeedback: true });
        return;
      }

      actions.setSyncState({ isPending: true, phase: "pending", message: "Saving entry and syncing in background…" });

      try {
        await performMergedSync();
        actions.setFormMessage("Entry saved and synced.", "success");
      } catch (error) {
        setSyncError(error.message);
        actions.setFormMessage(`Entry saved locally, but cloud sync failed: ${error.message}`, "error");
      } finally {
        resetForm({ preserveFeedback: true });
        finishSyncPhase();
      }
    });

    elements.resetFormBtn.addEventListener("click", resetForm);

    elements.exportJsonBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(readEntries(), null, 2)], { type: "application/json" });
      downloadBlob(blob, `daily-audit-backup-${todayAsLocalDateString()}.json`);
      actions.setDataMessage("JSON export downloaded.");
    });

    elements.exportCsvBtn.addEventListener("click", () => {
      const entries = sortEntriesNewestFirst(readEntries());
      if (entries.length === 0) {
        actions.setDataMessage("No entries to export.");
        return;
      }
      const blob = new Blob([entriesToCsv(entries)], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `daily-audit-export-${todayAsLocalDateString()}.csv`);
      actions.setDataMessage("CSV export downloaded.");
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
          actions.setEntries(cleaned);
          actions.setDataMessage(`Imported ${cleaned.length} entries from JSON.`);
        } catch {
          actions.setDataMessage("Import failed. That JSON appears to be malformed or in the wrong shape.");
        } finally {
          elements.importJsonInput.value = "";
        }
      };
      reader.readAsText(file);
    });

    elements.clearDataBtn.addEventListener("click", () => {
      const confirmed = window.confirm("Clear all saved entries from this browser? This cannot be undone unless you have exported a backup.");
      if (!confirmed) return;
      clearLocalData();
      actions.setDataMessage("All local data cleared.");
    });

    document.querySelectorAll("[data-reflection]").forEach(button => button.addEventListener("click", () => showReflection(button.dataset.reflection)));

    return {
      setSpeechStatus,
      appendTranscriptToField,
      resetForm,
      loadSyncSettingsIntoForm: () => {
        const settings = readSyncSettings();
        elements.workerBaseUrlInput.value = settings.workerBaseUrl;
        elements.syncKeyInput.value = settings.syncKey;
        elements.syncSecretInput.value = settings.syncSecret;
      },
      updateSyncStatusBox: () => renderSyncStatus(elements, getState())
    };
  }

  function setSpeechController(nextSpeechController) {
    speechController = nextSpeechController;
  }

  return { bind, setSpeechStatus, appendTranscriptToField, setSpeechController };
}
