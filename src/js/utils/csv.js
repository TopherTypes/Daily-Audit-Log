import { QUESTION_SCHEMA, validateQuestionSchema } from "../config/questions.js";

export const CSV_STABLE_HEADERS = [
  "id",
  "entryDate",
  "createdAt",
  "lastModified",
  "energy",
  "sleepHours",
  "sleepQuality",
  "exerciseLevel",
  "socialConnection",
  "focusWorkHours",
  "intentionality",
  "stressLevel"
];

export function csvEscape(value) {
  const stringValue = String(value).replace(/\r?\n/g, " ").trim();
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function entriesToCsv(entries) {
  validateQuestionSchema();
  const headers = [...CSV_STABLE_HEADERS, ...QUESTION_SCHEMA.map(question => question.id)];

  return [
    headers.join(","),
    ...entries.map(entry => headers.map(header => csvEscape(entry[header] ?? "")).join(","))
  ].join("\n");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      // Ignore carriage returns so CRLF files parse as expected.
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  return rows
    .map(parsedRow => parsedRow.map(value => value.trim()))
    .filter(parsedRow => parsedRow.length > 1 || parsedRow[0] !== "");
}
