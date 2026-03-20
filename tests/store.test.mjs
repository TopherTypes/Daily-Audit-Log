import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeEntries, normaliseEntry, sortEntriesNewestFirst } from '../src/js/state/store.js';
import { filterEntries } from '../src/js/ui/events.js';

test('mergeEntries keeps the newest revision for duplicate ids', () => {
  const local = [{ id: '1', entryDate: '2026-01-01', lastModified: '2026-01-01T10:00:00.000Z', energy: '3' }];
  const cloud = [{ id: '1', entryDate: '2026-01-01', lastModified: '2026-01-01T11:00:00.000Z', energy: '5' }];

  const merged = mergeEntries(local, cloud);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].energy, '5');
});

test('sortEntriesNewestFirst sorts by entryDate then lastModified', () => {
  const entries = [
    { id: 'a', entryDate: '2026-01-01', lastModified: '2026-01-01T09:00:00.000Z' },
    { id: 'b', entryDate: '2026-01-02', lastModified: '2026-01-02T08:00:00.000Z' },
    { id: 'c', entryDate: '2026-01-01', lastModified: '2026-01-01T11:00:00.000Z' }
  ];

  const sorted = sortEntriesNewestFirst(entries);
  assert.deepEqual(sorted.map(entry => entry.id), ['b', 'c', 'a']);
});

test('filterEntries now returns all entries for the review list', () => {
  const entries = [
    { id: 'a', entryDate: '2026-01-01' },
    { id: 'b', entryDate: '2026-01-08' },
    { id: 'c', entryDate: '2026-01-09' }
  ];

  const filtered = filterEntries(entries, { calendarMonthOffset: 2 });

  assert.deepEqual(filtered.map(entry => entry.id), ['a', 'b', 'c']);
});

test('mergeEntries keeps cloud entry when timestamps are equal', () => {
  const timestamp = '2026-01-01T10:00:00.000Z';
  const local = [{ id: '1', entryDate: '2026-01-01', lastModified: timestamp, energy: 'local' }];
  const cloud = [{ id: '1', entryDate: '2026-01-01', lastModified: timestamp, energy: 'cloud' }];

  const merged = mergeEntries(local, cloud);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].energy, 'cloud');
});

test('normaliseEntry preserves unknown keys and backfills new metrics to null', () => {
  const normalised = normaliseEntry({
    id: 'x',
    entryDate: '2026-02-01',
    createdAt: '2026-02-01T00:00:00.000Z',
    lastModified: '2026-02-01T10:00:00.000Z',
    energy: '4',
    extraKey: 'keep-me'
  });

  assert.equal(normalised.extraKey, 'keep-me');
  assert.equal(normalised.sleepHours, null);
  assert.equal(normalised.sleepQuality, null);
  assert.equal(normalised.exerciseLevel, null);
  assert.equal(normalised.socialConnection, null);
  assert.equal(normalised.focusWorkHours, null);
  assert.equal(normalised.intentionality, null);
  assert.equal(normalised.stressLevel, null);
  assert.equal(normalised.calorieIntake, null);
  assert.equal(normalised.weightKg, null);
  assert.equal(normalised.createdAt, '2026-02-01T00:00:00.000Z');
  assert.equal(normalised.lastModified, '2026-02-01T10:00:00.000Z');
});


test('normaliseEntry preserves numeric daily audit additions', () => {
  const normalised = normaliseEntry({
    id: 'metric-entry',
    entryDate: '2026-02-02',
    createdAt: '2026-02-02T00:00:00.000Z',
    lastModified: '2026-02-02T10:00:00.000Z',
    calorieIntake: 2200,
    weightKg: 72.4
  });

  assert.equal(normalised.calorieIntake, 2200);
  assert.equal(normalised.weightKg, 72.4);
});
