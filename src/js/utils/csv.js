import { QUESTION_SCHEMA, validateQuestionSchema } from "../config/questions.js";

export function csvEscape(value) {
  const stringValue = String(value).replace(/\r?\n/g, " ").trim();
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function entriesToCsv(entries) {
  validateQuestionSchema();
  const headers = [
    "id", "entryDate", "createdAt", "lastModified", "energy", ...QUESTION_SCHEMA.map(question => question.id)
  ];

  return [
    headers.join(","),
    ...entries.map(entry => headers.map(header => csvEscape(entry[header] ?? "")).join(","))
  ].join("\n");
}
