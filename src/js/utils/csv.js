export function csvEscape(value) {
  const stringValue = String(value).replace(/\r?\n/g, " ").trim();
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function entriesToCsv(entries) {
  const headers = [
    "id", "entryDate", "createdAt", "lastModified", "feeling", "energy", "mattered", "offCourse", "supported", "remember", "needNext"
  ];

  return [
    headers.join(","),
    ...entries.map(entry => headers.map(header => csvEscape(entry[header] ?? "")).join(","))
  ].join("\n");
}
