import { QUESTION_SCHEMA, validateQuestionSchema } from "../config/questions.js";
import { formatDisplayDate, formatDisplayTimestamp, formatYMD, parseYMDToDate } from "../utils/date.js";

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
  if (entries.length === 0) {
    entriesListEl.innerHTML = '<div class="empty-state">No entries yet. Your future self is currently unbriefed.</div>';
    return;
  }
  entriesListEl.innerHTML = entries.map(entryToCardHtml).join("");
}

function getCalendarRange(filters, entries) {
  const filterValue = filters?.recent || "7";
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  let rangeStart;
  let rangeEnd;

  if (filterValue === "custom" && filters?.customStartDate && filters?.customEndDate) {
    rangeStart = parseYMDToDate(filters.customStartDate);
    rangeEnd = parseYMDToDate(filters.customEndDate);
  } else if (filterValue !== "custom") {
    const days = Number(filterValue);
    rangeEnd = new Date(today);
    rangeStart = new Date(today);
    rangeStart.setDate(rangeStart.getDate() - (days - 1));
  } else if (entries.length > 0) {
    const sortedDates = entries
      .map(entry => entry.entryDate)
      .filter(Boolean)
      .sort();
    rangeStart = parseYMDToDate(sortedDates[0]);
    rangeEnd = parseYMDToDate(sortedDates[sortedDates.length - 1]);
  } else {
    return null;
  }

  if (!rangeStart || !rangeEnd || rangeStart.getTime() > rangeEnd.getTime()) return null;

  // Expand the selected review range to full calendar weeks so logged and missing
  // days are easy to scan without partial rows at the month boundaries.
  const monthStart = new Date(rangeStart);
  monthStart.setDate(1);
  const monthEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 1, 0, 12, 0, 0, 0);

  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - monthStart.getDay());

  const calendarEnd = new Date(monthEnd);
  calendarEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  return { calendarStart, calendarEnd, rangeStart, rangeEnd };
}

function renderReviewCalendar(reviewCalendarEl, entries, filters) {
  if (!reviewCalendarEl) return;

  const entryDateSet = new Set(entries.map(entry => entry.entryDate));
  const range = getCalendarRange(filters, entries);
  if (!range) {
    reviewCalendarEl.innerHTML = '<div class="empty-state">Choose a valid date range to see your audit calendar.</div>';
    return;
  }

  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  const dayNumberFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric" });
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayKey = formatYMD(new Date());
  const months = [];
  let monthCursor = new Date(range.rangeStart);

  while (monthCursor.getTime() <= range.rangeEnd.getTime()) {
    months.push({
      year: monthCursor.getFullYear(),
      month: monthCursor.getMonth(),
      label: monthFormatter.format(monthCursor)
    });
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1, 12, 0, 0, 0);
  }

  const monthSections = months.map(({ year, month, label }) => {
    const monthStart = new Date(year, month, 1, 12, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 12, 0, 0, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

    const cells = [];

    for (let cursor = new Date(gridStart); cursor.getTime() <= gridEnd.getTime(); cursor.setDate(cursor.getDate() + 1)) {
      const dateKey = formatYMD(cursor);
      const inMonth = cursor.getMonth() === month;
      const hasEntry = entryDateSet.has(dateKey);
      const isToday = dateKey === todayKey;
      const classes = ["review-calendar-day"];
      if (!inMonth) classes.push("outside-month");
      if (hasEntry) classes.push("has-entry");
      else classes.push("missing-entry");
      if (isToday) classes.push("is-today");

      const stateLabel = hasEntry ? "Audit logged" : "No audit logged";
      const todayLabel = isToday ? ". Today." : "";
      cells.push(`<div class="${classes.join(" ")}" aria-label="${escapeHtml(formatDisplayDate(dateKey))}. ${stateLabel}${todayLabel}"><span class="review-calendar-day-number">${escapeHtml(dayNumberFormatter.format(cursor))}</span><span class="review-calendar-day-status">${hasEntry ? "Logged" : "Missing"}</span></div>`);
    }

    return `<section class="review-calendar-month" aria-label="${escapeHtml(label)}"><div class="review-calendar-month-header"><h3>${escapeHtml(label)}</h3></div><div class="review-calendar-grid" role="grid"><div class="review-calendar-weekdays" aria-hidden="true">${weekdayLabels.map(day => `<span>${day}</span>`).join("")}</div>${cells.join("")}</div></section>`;
  }).join("");

  reviewCalendarEl.innerHTML = `<div class="review-calendar-summary"><span class="pill success-pill">${escapeHtml(String(entryDateSet.size))} days logged</span><span class="pill muted-pill">${escapeHtml(String(months.length))} month${months.length === 1 ? "" : "s"} shown</span></div><div class="review-calendar-legend" aria-label="Calendar legend"><span class="review-calendar-legend-item"><span class="review-calendar-swatch has-entry" aria-hidden="true"></span>Audit logged</span><span class="review-calendar-legend-item"><span class="review-calendar-swatch missing-entry" aria-hidden="true"></span>No audit logged</span><span class="review-calendar-legend-item"><span class="review-calendar-swatch today" aria-hidden="true"></span>Today</span></div><div class="review-calendar-months">${monthSections}</div>`;
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
