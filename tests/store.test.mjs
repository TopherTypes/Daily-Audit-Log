import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeEntries, sortEntriesNewestFirst } from '../src/js/state/store.js';
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

test('filterEntries supports custom date windows', () => {
  const entries = [
    { id: 'a', entryDate: '2026-01-01' },
    { id: 'b', entryDate: '2026-01-08' },
    { id: 'c', entryDate: '2026-01-09' }
  ];

  const filtered = filterEntries(entries, {
    recent: 'custom',
    customStartDate: '2026-01-02',
    customEndDate: '2026-01-08'
  });

  assert.deepEqual(filtered.map(entry => entry.id), ['b']);
});
