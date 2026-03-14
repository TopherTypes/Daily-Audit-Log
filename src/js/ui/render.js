import { QUESTION_SCHEMA, validateQuestionSchema } from "../config/questions.js";
import { formatDisplayDate, formatDisplayTimestamp } from "../utils/date.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function questionToFieldHtml(question) {
  if (question.type !== "textarea") {
    console.error(`Unsupported field type \"${question.type}\" for question \"${question.id}\".`);
    return "";
  }

  const micButton = question.supportsSpeech
    ? `<button type="button" class="mic-btn" data-target="${escapeHtml(question.id)}" aria-label="Use voice input for ${escapeHtml(question.label)}">🎤</button>`
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
  const visibleFields = QUESTION_SCHEMA
    .map(question => [question.label, entry[question.id]])
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([label, value]) => `<div class="entry-field"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`)
    .join("");

  return `<article class="entry-card"><div class="entry-top"><div><div class="entry-date">${escapeHtml(formatDisplayDate(entry.entryDate))}</div><div class="small">Updated ${escapeHtml(formatDisplayTimestamp(entry.lastModified || entry.createdAt))}</div></div><span class="pill">Energy ${escapeHtml(entry.energy)}</span></div><div class="entry-fields">${visibleFields || '<div class="small">This entry is mostly empty, which is still a valid life form.</div>'}</div></article>`;
}

export function renderEntries(entriesListEl, entries) {
  if (entries.length === 0) {
    entriesListEl.innerHTML = '<div class="empty-state">No entries yet. Your future self is currently unbriefed.</div>';
    return;
  }
  entriesListEl.innerHTML = entries.map(entryToCardHtml).join("");
}

export function renderReviewList(reviewResultEl, entries) {
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
