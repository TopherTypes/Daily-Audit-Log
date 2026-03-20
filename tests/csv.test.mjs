import test from 'node:test';
import assert from 'node:assert/strict';

import { CSV_STABLE_HEADERS, entriesToCsv, parseCsv } from '../src/js/utils/csv.js';

test('entriesToCsv exports stable headers before question fields and blanks for null', () => {
  const csv = entriesToCsv([{
    id: '1',
    entryDate: '2026-03-01',
    createdAt: '2026-03-01T00:00:00.000Z',
    lastModified: '2026-03-01T00:00:00.000Z',
    energy: '3',
    sleepHours: null,
    sleepQuality: null,
    exerciseLevel: null,
    socialConnection: null,
    focusWorkHours: null,
    intentionality: null,
    stressLevel: null
  }]);

  const [headerRow, firstDataRow] = csv.split('\n');
  const headers = headerRow.split(',');
  assert.deepEqual(headers.slice(0, CSV_STABLE_HEADERS.length), CSV_STABLE_HEADERS);
  assert.match(firstDataRow, /""/);
});

test('parseCsv handles quoted fields and trims values', () => {
  const rows = parseCsv(`id,entryDate,energy\n"1"," 2026-03-02 ","""High"""\n`);
  assert.equal(rows[1][1], '2026-03-02');
  assert.equal(rows[1][2], '"High"');
});

import { csvEscape } from '../src/js/utils/csv.js';

test('csvEscape preserves embedded newlines inside the quoted field', () => {
  const result = csvEscape('line one\nline two');
  assert.equal(result, '"line one\nline two"');
});

test('csvEscape escapes double-quotes by doubling them', () => {
  const result = csvEscape('say "hello"');
  assert.equal(result, '"say ""hello"""');
});

test('csvEscape treats null/undefined as empty string', () => {
  assert.equal(csvEscape(null), '""');
  assert.equal(csvEscape(undefined), '""');
});


test('CSV stable headers include calorie and weight metrics', () => {
  assert.equal(CSV_STABLE_HEADERS.includes('calorieIntake'), true);
  assert.equal(CSV_STABLE_HEADERS.includes('weightKg'), true);
});
