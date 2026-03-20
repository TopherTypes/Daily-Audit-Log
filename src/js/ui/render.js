import { QUESTION_SCHEMA, validateQuestionSchema } from "../config/questions.js";
import { formatDisplayDate, formatDisplayTimestamp, formatYMD } from "../utils/date.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function questionToFieldHtml(question) {
  if (question.type === "textarea") {
    const micButton = question.supportsSpeech
      ? `<button type="button" class="mic-btn" data-target="${escapeHtml(question.id)}" aria-label="Start voice input for ${escapeHtml(question.label)}" aria-pressed="false"><span aria-hidden="true">🎤</span> <span class="mic-btn-text">Voice</span></button>`
      : "";

    return `<div class="field"><label for="${escapeHtml(question.id)}">${escapeHtml(question.label)}</label><div class="textarea-with-mic"><textarea id="${escapeHtml(question.id)}" maxlength="${escapeHtml(question.maxLength)}" placeholder="${escapeHtml(question.placeholder)}"></textarea>${micButton}</div></div>`;
  }

  if (question.type === "number") {
    const minAttr = question.min !== undefined ? ` min="${escapeHtml(question.min)}"` : "";
    const maxAttr = question.max !== undefined ? ` max="${escapeHtml(question.max)}"` : "";
    const stepAttr = question.step !== undefined ? ` step="${escapeHtml(question.step)}"` : "";
    const inputModeAttr = question.inputMode ? ` inputmode="${escapeHtml(question.inputMode)}"` : "";
    return `<div class="field"><label for="${escapeHtml(question.id)}">${escapeHtml(question.label)}</label><input type="number" id="${escapeHtml(question.id)}" placeholder="${escapeHtml(question.placeholder)}"${minAttr}${maxAttr}${stepAttr}${inputModeAttr} /></div>`;
  }

  console.error(`Unsupported field type "${question.type}" for question "${question.id}".`);
  return "";
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
    { key: "stressLevel", label: "Stress" },
    { key: "calorieIntake", label: "Calories" },
    { key: "weightKg", label: "Weight", format: value => `${Number(value).toFixed(1).replace(/\.0$/, "")} kg` }
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
  if (!entriesListEl) {
    // Guard against markup regressions so the rest of the app can keep rendering
    // even if the entries mount point is accidentally removed.
    console.error("Entries list container is missing from the DOM.");
    return;
  }

  if (entries.length === 0) {
    entriesListEl.innerHTML = '<div class="empty-state">No entries yet. Your future self is currently unbriefed.</div>';
    return;
  }
  entriesListEl.innerHTML = entries.map(entryToCardHtml).join("");
}

function getVisibleCalendarMonth(filters, entries) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const offset = Number(filters?.calendarMonthOffset ?? 0);
  const visibleMonth = new Date(today.getFullYear(), today.getMonth() + offset, 1, 12, 0, 0, 0);

  if (entries.length === 0) {
    return { visibleMonth, hasPreviousMonthWithEntries: false, hasNextMonthWithEntries: false };
  }

  const sortedDates = entries
    .map(entry => entry.entryDate)
    .filter(Boolean)
    .sort();

  const firstEntryMonth = new Date(`${sortedDates[0]}T12:00:00`);
  const lastEntryMonth = new Date(`${sortedDates[sortedDates.length - 1]}T12:00:00`);
  const previousMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1, 12, 0, 0, 0);
  const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1, 12, 0, 0, 0);

  return {
    visibleMonth,
    hasPreviousMonthWithEntries: previousMonth.getTime() >= new Date(firstEntryMonth.getFullYear(), firstEntryMonth.getMonth(), 1, 12, 0, 0, 0).getTime(),
    hasNextMonthWithEntries: nextMonth.getTime() <= new Date(lastEntryMonth.getFullYear(), lastEntryMonth.getMonth(), 1, 12, 0, 0, 0).getTime()
  };
}

function renderReviewCalendar(reviewCalendarEl, entries, filters) {
  if (!reviewCalendarEl) return;

  const entryDateSet = new Set(entries.map(entry => entry.entryDate));
  const { visibleMonth, hasPreviousMonthWithEntries, hasNextMonthWithEntries } = getVisibleCalendarMonth(filters, entries);
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  const dayNumberFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric" });
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayKey = formatYMD(today);

  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12, 0, 0, 0);
  const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0, 12, 0, 0, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const cells = [];

  for (let cursor = new Date(gridStart); cursor.getTime() <= gridEnd.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    const dateKey = formatYMD(cursor);
    const inMonth = cursor.getMonth() === visibleMonth.getMonth();
    const hasEntry = entryDateSet.has(dateKey);
    const isToday = dateKey === todayKey;
    const isFuture = cursor.getTime() > today.getTime();
    const classes = ["review-calendar-day"];

    if (!inMonth) classes.push("outside-month");
    if (isFuture) classes.push("future-day");
    else if (hasEntry) classes.push("has-entry");
    else classes.push("missing-entry");
    if (isToday) classes.push("is-today");

    const stateLabel = isFuture ? "Future date" : hasEntry ? "Audit logged" : "No audit logged";
    const statusText = isFuture ? "Upcoming" : hasEntry ? "Logged" : "Missing";
    const todayLabel = isToday ? ". Today." : "";
    cells.push(`<div class="${classes.join(" ")}" aria-label="${escapeHtml(formatDisplayDate(dateKey))}. ${stateLabel}${todayLabel}"><span class="review-calendar-day-number">${escapeHtml(dayNumberFormatter.format(cursor))}</span><span class="review-calendar-day-status">${statusText}</span></div>`);
  }

  const monthLabel = monthFormatter.format(visibleMonth);
  reviewCalendarEl.innerHTML = `<div class="review-calendar-summary"><span class="pill success-pill">${escapeHtml(String(entryDateSet.size))} days logged</span><span class="pill muted-pill">Viewing ${escapeHtml(monthLabel)}</span></div><div class="review-calendar-legend" aria-label="Calendar legend"><span class="review-calendar-legend-item"><span class="review-calendar-swatch has-entry" aria-hidden="true"></span>Audit logged</span><span class="review-calendar-legend-item"><span class="review-calendar-swatch missing-entry" aria-hidden="true"></span>No audit logged</span><span class="review-calendar-legend-item"><span class="review-calendar-swatch future-day" aria-hidden="true"></span>Future date</span><span class="review-calendar-legend-item"><span class="review-calendar-swatch today" aria-hidden="true"></span>Today</span></div><div class="review-calendar-toolbar"><button type="button" class="review-calendar-nav" data-calendar-nav="previous" aria-label="Show previous month">← Previous</button><div class="review-calendar-current-month" aria-live="polite">${escapeHtml(monthLabel)}</div><button type="button" class="review-calendar-nav" data-calendar-nav="next" aria-label="Show next month">Next →</button></div><section class="review-calendar-month" aria-label="${escapeHtml(monthLabel)}"><div class="review-calendar-month-header"><h3>${escapeHtml(monthLabel)}</h3><p class="small muted">${entries.length === 0 ? "No saved entries yet." : `${hasPreviousMonthWithEntries ? "Earlier entries available." : ""}${hasPreviousMonthWithEntries && hasNextMonthWithEntries ? " " : ""}${hasNextMonthWithEntries ? "Later entry months available." : ""}`.trim() || "Browse around to compare months."}</p></div><div class="review-calendar-grid" role="grid"><div class="review-calendar-weekdays" aria-hidden="true">${weekdayLabels.map(day => `<span>${day}</span>`).join("")}</div>${cells.join("")}</div></section>`;
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

export function renderReview(elements, entries, filters) {
  renderReviewCalendar(elements.reviewCalendar, entries, filters);
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
