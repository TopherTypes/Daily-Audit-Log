import test from 'node:test';
import assert from 'node:assert/strict';

import { renderReview } from '../src/js/ui/render.js';
import { formatYMD } from '../src/js/utils/date.js';

function makeMonthDate(offsetDays) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return formatYMD(date);
}

test('renderReview outputs month navigation controls', () => {
  const reviewCalendar = { innerHTML: '' };

  renderReview({ reviewCalendar }, [{ id: '1', entryDate: makeMonthDate(-1) }], { calendarMonthOffset: 0 });

  assert.match(reviewCalendar.innerHTML, /data-calendar-nav="previous"/);
  assert.match(reviewCalendar.innerHTML, /data-calendar-nav="next"/);
});

test('renderReview marks future dates as upcoming', () => {
  const reviewCalendar = { innerHTML: '' };

  renderReview({ reviewCalendar }, [{ id: '1', entryDate: makeMonthDate(-1) }], { calendarMonthOffset: 0 });

  assert.match(reviewCalendar.innerHTML, /future-day/);
  assert.match(reviewCalendar.innerHTML, /Upcoming/);
});
