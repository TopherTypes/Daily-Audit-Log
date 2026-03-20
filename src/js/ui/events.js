import { todayAsLocalDateString, nowIso, formatYMD, parseYMDToDate } from "../utils/date.js";
import { CSV_STABLE_HEADERS, entriesToCsv, parseCsv } from "../utils/csv.js";
import { readEntries, readSyncSettings, generateId, saveEntries } from "../services/storage.js";
import { hasSyncConfigured } from "../services/sync.js";
import { actions, getState, normaliseEntry, sortEntriesNewestFirst, subscribe } from "../state/store.js";
import { QUESTION_SCHEMA } from "../config/questions.js";
import { THEME_PREFERENCE_KEY } from "../config.js";
import { clearLocalData, finishSyncPhase, hydrateFromStorage, performMergedSync, persistSyncSecret, setSyncError } from "../services/workflows.js";
import { renderEntries, renderFormState, renderReflectionResult, renderReview, renderSyncStatus } from "./render.js";

const INTEGER_IMPORT_RANGES = {
  sleepQuality: { label: "Sleep quality", min: 1, max: 5 },
  exerciseLevel: { label: "Exercise level", min: 0, max: 5 },
  socialConnection: { label: "Social connection", min: 0, max: 5 },
  intentionality: { label: "Intentionality", min: 1, max: 5 },
  stressLevel: { label: "Stress level", min: 0, max: 5 }
};

const DECIMAL_IMPORT_RANGES = {
  sleepHours: { label: "Sleep hours", min: 0, max: 24 },
  focusWorkHours: { label: "Focus work hours", min: 0, max: 24 },
  calorieIntake: { label: "Calorie intake", min: 0, max: 20000 },
  weightKg: { label: "Weight (in kg)", min: 0, max: 1000 }
};

function getSelectedEnergy() {
  const checked = document.querySelector('input[name="energy"]:checked');
  return checked ? checked.value : "";
}

function getSelectedIntegerOption(fieldName) {
  const checked = document.querySelector(`input[name="${fieldName}"]:checked`);
  if (!checked) return null;
  const parsed = Number(checked.value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function clearSelectedEnergy() {
  document.querySelectorAll('input[name="energy"]').forEach(radio => { radio.checked = false; });
}

function clearSelectedIntegerOptions(fieldNames) {
  fieldNames.forEach(fieldName => {
    document.querySelectorAll(`input[name="${fieldName}"]`).forEach(radio => { radio.checked = false; });
  });
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
  const fieldErrors = {};
  if (!entry.entryDate) fieldErrors.entryDate = "Please choose a date.";
  if (!entry.energy) fieldErrors.energy = "Please select an energy rating.";

  validateIntegerRange(entry.sleepQuality, "Sleep quality", 1, 5, fieldErrors, "sleepQuality");
  validateIntegerRange(entry.exerciseLevel, "Exercise level", 0, 5, fieldErrors, "exerciseLevel");
  validateIntegerRange(entry.socialConnection, "Social connection", 0, 5, fieldErrors, "socialConnection");
  validateIntegerRange(entry.intentionality, "Intentionality", 1, 5, fieldErrors, "intentionality");
  validateIntegerRange(entry.stressLevel, "Stress level", 0, 5, fieldErrors, "stressLevel");
  validateDecimalRange(entry.calorieIntake, "Calorie intake", 0, 20000, fieldErrors, "calorieIntake");
  validateDecimalRange(entry.weightKg, "Weight (in kg)", 0, 1000, fieldErrors, "weightKg");

  if (Object.keys(fieldErrors).length > 0) {
    return {
      formMessage: "Please fix the highlighted fields before saving.",
      fieldErrors
    };
  }

  return { formMessage: "", fieldErrors: {} };
}

function parseOptionalCsvNumber(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  const trimmed = String(rawValue).trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseOptionalCsvInteger(rawValue) {
  const parsed = parseOptionalCsvNumber(rawValue);
  if (parsed === null) return null;
  if (!Number.isInteger(parsed)) return Number.NaN;
  return parsed;
}

function validateDecimalRange(value, label, min, max, fieldErrors, fieldKey) {
  if (value === null) return;
  if (!Number.isFinite(value) || value < min || value > max) {
    fieldErrors[fieldKey] = `${label} must be a number from ${min} to ${max}.`;
  }
}

function parseCsvImportEntries(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error("CSV file has no data rows.");

  const headers = rows[0].map(header => header.trim());
  if (headers.length === 0) throw new Error("CSV file is missing headers.");

  const requiredHeaders = CSV_STABLE_HEADERS.slice(0, 5);
  const missingRequired = requiredHeaders.filter(header => !headers.includes(header));
  if (missingRequired.length > 0) {
    throw new Error(`CSV is missing required headers: ${missingRequired.join(", ")}.`);
  }

  const importedEntries = [];

  rows.slice(1).forEach((values, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const rawEntry = {};

    headers.forEach((header, columnIndex) => {
      const value = values[columnIndex] ?? "";
      rawEntry[header] = value === "" ? null : value;
    });

    const fieldErrors = {};

    Object.entries(INTEGER_IMPORT_RANGES).forEach(([fieldKey, range]) => {
      const parsed = parseOptionalCsvInteger(rawEntry[fieldKey]);
      rawEntry[fieldKey] = parsed;
      validateIntegerRange(parsed, range.label, range.min, range.max, fieldErrors, fieldKey);
    });

    Object.entries(DECIMAL_IMPORT_RANGES).forEach(([fieldKey, range]) => {
      const parsed = parseOptionalCsvNumber(rawEntry[fieldKey]);
      rawEntry[fieldKey] = parsed;
      validateDecimalRange(parsed, range.label, range.min, range.max, fieldErrors, fieldKey);
    });

    if (Object.keys(fieldErrors).length > 0) {
      const firstError = Object.values(fieldErrors)[0];
      throw new Error(`Row ${rowNumber}: ${firstError}`);
    }

    importedEntries.push(normaliseEntry(rawEntry));
  });

  return importedEntries;
}

function parseOptionalIntegerField(input) {
  const rawValue = input?.value?.trim() ?? "";
  if (rawValue === "") return null;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) return Number.NaN;
  return parsed;
}

function parseOptionalNumberField(input) {
  const rawValue = input?.value?.trim() ?? "";
  if (rawValue === "") return null;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validateIntegerRange(value, label, min, max, fieldErrors, fieldKey) {
  if (value === null) return;
  if (!Number.isInteger(value) || value < min || value > max) {
    fieldErrors[fieldKey] = `${label} must be an integer from ${min} to ${max}.`;
  }
}

function parseHourMinutePair(hoursInput, minutesInput, label, { minHours = 0, maxHours = 24 } = {}) {
  const hours = parseOptionalIntegerField(hoursInput);
  const minutes = parseOptionalIntegerField(minutesInput);

  if (hours === null && minutes === null) {
    return { value: null, error: "" };
  }

  if (hours === null || minutes === null) {
    return { value: null, error: `${label} requires both hours and minutes or both blank.` };
  }

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return { value: null, error: `${label} hours and minutes must be whole numbers.` };
  }

  if (hours < minHours || hours > maxHours || minutes < 0 || minutes > 59) {
    return { value: null, error: `${label} must use hours ${minHours}–${maxHours} and minutes 0–59.` };
  }

  const encodedValue = Number(((hours * 60 + minutes) / 60).toFixed(4));
  return { value: encodedValue, error: "" };
}

function clearInlineValidation(form) {
  form.querySelectorAll(".inline-field-error").forEach(node => node.remove());
  form.querySelectorAll("[aria-invalid='true']").forEach(node => node.setAttribute("aria-invalid", "false"));
}

function renderInlineValidation(form, fieldErrors) {
  Object.entries(fieldErrors).forEach(([fieldId, message]) => {
    const input = document.getElementById(fieldId);
    const radioInputs = Array.from(document.querySelectorAll(`input[name="${fieldId}"]`));
    if ((!input && radioInputs.length === 0) || !message) return;

    if (input) input.setAttribute("aria-invalid", "true");
    radioInputs.forEach(radio => radio.setAttribute("aria-invalid", "true"));

    const errorEl = document.createElement("p");
    errorEl.className = "small inline-feedback error inline-field-error";
    errorEl.textContent = message;

    const target = input || radioInputs[0];
    const container = target.closest(".field") || target.parentElement;
    if (container) {
      container.appendChild(errorEl);
    }
  });
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
    clearInlineValidation(elements.form);
    elements.form.reset();
    elements.entryDate.value = todayAsLocalDateString();
    clearSelectedEnergy();
    clearSelectedIntegerOptions(["sleepQuality", "exerciseLevel", "socialConnection", "intentionality", "stressLevel"]);
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
        // Surface in the settings panel only; do not overwrite lastSyncStatus
        // for a manually-triggered pull since that metadata tracks auto-syncs.
        actions.setSyncSettingsMessage(error.message);
      } finally {
        finishSyncPhase();
      }
    });

    elements.form.addEventListener("submit", async event => {
      event.preventDefault();
      clearInlineValidation(elements.form);
      const timestamp = nowIso();
      const sleepHoursInput = document.getElementById("sleepHoursHours");
      const sleepMinutesInput = document.getElementById("sleepHoursMinutes");
      const focusHoursInput = document.getElementById("focusWorkHoursHours");
      const focusMinutesInput = document.getElementById("focusWorkHoursMinutes");
      const sleepHours = parseHourMinutePair(sleepHoursInput, sleepMinutesInput, "Sleep hours");
      const focusWorkHours = parseHourMinutePair(focusHoursInput, focusMinutesInput, "Focused work hours");

      // Parse schema-defined inputs by type so new numeric prompts are stored as numbers,
      // while existing reflective prompts continue to persist as trimmed text.
      const schemaFieldValues = Object.fromEntries(
        QUESTION_SCHEMA.map(question => {
          const input = elements.questionInputs[question.id];
          if (!input) {
            console.error(`Missing input for schema field "${question.id}".`);
            return [question.id, question.type === "number" ? null : ""];
          }

          if (question.type === "number") {
            return [question.id, parseOptionalNumberField(input)];
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
        sleepHours: sleepHours.value,
        sleepQuality: getSelectedIntegerOption("sleepQuality"),
        exerciseLevel: getSelectedIntegerOption("exerciseLevel"),
        socialConnection: getSelectedIntegerOption("socialConnection"),
        focusWorkHours: focusWorkHours.value,
        intentionality: getSelectedIntegerOption("intentionality"),
        stressLevel: getSelectedIntegerOption("stressLevel"),
        ...schemaFieldValues
      });

      const { formMessage, fieldErrors } = validateEntry(entry);
      if (sleepHours.error) fieldErrors.sleepHoursHours = sleepHours.error;
      if (focusWorkHours.error) fieldErrors.focusWorkHoursHours = focusWorkHours.error;

      if (Object.keys(fieldErrors).length > 0) {
        renderInlineValidation(elements.form, fieldErrors);
        actions.setFormMessage(formMessage || "Please fix the highlighted fields before saving.", "error");
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
          const sorted = sortEntriesNewestFirst(cleaned);
          saveEntries(sorted);
          actions.setEntries(sorted);
          actions.setDataMessage(`Imported ${cleaned.length} entries from JSON.`);
        } catch {
          actions.setDataMessage("Import failed. That JSON appears to be malformed or in the wrong shape.");
        } finally {
          elements.importJsonInput.value = "";
        }
      };
      reader.readAsText(file);
    });

    elements.importCsvTrigger.addEventListener("click", () => elements.importCsvInput.click());
    elements.importCsvInput.addEventListener("change", event => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = parseCsvImportEntries(String(reader.result ?? ""));
          const sortedEntries = sortEntriesNewestFirst(imported);
          saveEntries(sortedEntries);
          actions.setEntries(sortedEntries);
          actions.setDataMessage(`Imported ${imported.length} entries from CSV.`);
        } catch (error) {
          actions.setDataMessage(`CSV import failed: ${error.message}`);
        } finally {
          elements.importCsvInput.value = "";
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
