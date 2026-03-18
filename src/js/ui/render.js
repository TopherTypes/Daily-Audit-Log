import { QUESTION_SCHEMA, validateQuestionSchema } from "../config/questions.js";
import { formatDisplayDate, formatDisplayTimestamp } from "../utils/date.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function questionToFieldHtml(question) {
  if (question.type !== "textarea") {
    console.error(`Unsupported field type \"${question.type}\" for question \"${question.id}\".`);
    return "";
  }

  const micButton = question.supportsSpeech
    ? `<button type="button" class="mic-btn" data-target="${escapeHtml(question.id)}" aria-label="Start voice input for ${escapeHtml(question.label)}" aria-pressed="false"><span aria-hidden="true">🎤</span> <span class="mic-btn-text">Voice</span></button>`
    : "";

  return `<div class="field"><label for="${escapeHtml(question.id)}">${escapeHtml(question.label)}</label><div class="textarea-with-mic"><textarea id="${escapeHtml(question.id)}" maxlength="${escapeHtml(question.maxLength)}" placeholder="${escapeHtml(question.placeholder)}"></textarea>${micButton}</div></div>`;
}

export function renderAuditQuestionFields(questionFieldsEl) {
  if (!questionFieldsEl) {
    console.error("Question field container is missing from the DOM.");
    return;
  }

  validateQuestionSchema();
  questionFieldsEl.innerHTML = QUESTION_SCHEMA.map(questionToFieldHtml).join("");
}

export function entryToCardHtml(entry) {
  const hasMetricValue = value => {
    if (value === undefined || value === null) return false;
    if (typeof value === "number") return Number.isFinite(value);
    return String(value).trim() !== "";
  };

  const formatHoursMetric = value => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "";

    const totalMinutes = Math.round(numericValue * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) return `${hours}h`;
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  const metricDefinitions = [
    { key: "sleepHours", label: "Sleep", format: formatHoursMetric },
    { key: "sleepQuality", label: "Sleep quality" },
    { key: "exerciseLevel", label: "Exercise" },
    { key: "socialConnection", label: "Social" },
    { key: "focusWorkHours", label: "Focus", format: formatHoursMetric },
    { key: "intentionality", label: "Intentionality" },
    { key: "stressLevel", label: "Stress" }
  ];

  const metricPills = metricDefinitions
    .filter(metric => hasMetricValue(entry[metric.key]))
    .map(metric => {
      const rawValue = metric.format ? metric.format(entry[metric.key]) : String(entry[metric.key]).trim();
      if (!rawValue) return "";
      return `<span class="pill metric-pill"><strong>${escapeHtml(metric.label)}:</strong>&nbsp;${escapeHtml(rawValue)}</span>`;
    })
    .filter(Boolean)
    .join("");

  const metricsBlock = metricPills
    ? `<div class="entry-metrics"><div class="small">Daily metrics</div><div class="entry-metric-pills">${metricPills}</div></div>`
    : "";

  const visibleFields = QUESTION_SCHEMA
    .map(question => [question.label, entry[question.id]])
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([label, value]) => `<div class="entry-field"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`)
    .join("");

  return `<article class="entry-card"><div class="entry-top"><div><div class="entry-date">${escapeHtml(formatDisplayDate(entry.entryDate))}</div><div class="small">Updated ${escapeHtml(formatDisplayTimestamp(entry.lastModified || entry.createdAt))}</div></div><span class="pill">Energy ${escapeHtml(entry.energy)}</span></div>${metricsBlock}<div class="entry-fields">${visibleFields || '<div class="small">This entry is mostly empty, which is still a valid life form.</div>'}</div></article>`;
}

function renderEntriesList(entriesListEl, entries) {
  if (entries.length === 0) {
    entriesListEl.innerHTML = '<div class="empty-state">No entries yet. Your future self is currently unbriefed.</div>';
    return;
  }
  entriesListEl.innerHTML = entries.map(entryToCardHtml).join("");
}

function renderReviewList(reviewResultEl, entries) {
  if (entries.length === 0) {
    reviewResultEl.innerHTML = '<div class="empty-state">No entries yet to review.</div>';
    return;
  }
  reviewResultEl.innerHTML = entries.map(entryToCardHtml).join("");
}

export function renderReflectionResult(reviewResultEl, kind, targetDateString, bestEntry) {
  if (!bestEntry) {
    reviewResultEl.innerHTML = '<div class="empty-state">No entries found yet.</div>';
    return;
  }

  const targetLabel = kind === "week" ? "This time last week" : kind === "month" ? "This time last month" : "This time last year";
  reviewResultEl.innerHTML = `<div class="small">${escapeHtml(targetLabel)} — target date ${escapeHtml(formatDisplayDate(targetDateString))}</div>${entryToCardHtml(bestEntry)}`;
}

export function renderFormState(elements, state) {
  elements.formMessage.textContent = state.ui.formMessage.text;
  elements.formMessage.classList.remove("success", "error");
  if (state.ui.formMessage.mode) elements.formMessage.classList.add(state.ui.formMessage.mode);

  if (elements.stickySaveFeedback) {
    elements.stickySaveFeedback.textContent = state.ui.formMessage.text || "Entries save locally first, then sync if configured.";
  }

  if (elements.dataMessage) elements.dataMessage.textContent = state.ui.dataMessage;
}

export function renderEntries(elements, entries) {
  renderEntriesList(elements.entriesList, entries);
}

export function renderReview(elements, entries) {
  renderReviewList(elements.reviewResult, entries.slice(0, 5));
}

export function renderSyncStatus(elements, state) {
  const meta = state.syncMeta;
  const syncUi = state.ui.sync;

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

  elements.syncSettingsMessage.textContent = state.ui.syncSettingsMessage;

  elements.syncOverlayMessage.textContent = syncUi.message || "Please wait while your entries are merged and synced.";
  elements.syncOverlay.classList.toggle("hidden", !syncUi.isPending);
  document.body.style.overflow = syncUi.isPending ? "hidden" : "";

  // Keep sync controls responsive by scoping loading states to sync-affecting actions only.
  elements.pullFromCloudBtn.disabled = syncUi.isPending;
  elements.saveSyncSettingsBtn.disabled = syncUi.phase === "pulling" || syncUi.phase === "pushing";
}
