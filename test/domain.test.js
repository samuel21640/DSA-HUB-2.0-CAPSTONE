import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  listEventSummaries,
  publishEvent,
} from '../src/domain/inventory.js';
import { filterEvents, searchEvents, sortEvents } from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';
import { mergeSort } from '../src/domain/sorting.js';

function createValidEvent(store, overrides = {}) {
  return createEvent(store, {
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Main Hall',
    date: '2026-12-05T17:00:00.000Z',
    ...overrides,
  });
}

function createSummary({
  id,
  title,
  city = 'Lagos',
  venue = 'Main Hall',
  date = '2026-12-05T17:00:00.000Z',
  tiers = [{ priceCents: 500, available: 2 }],
}) {
  return { id, title, city, venue, date, tiers };
}

function assertDomainCode(callback, code) {
  assert.throws(callback, (error) => error instanceof DomainError && error.code === code);
}

test('S02: valid event creation saves a draft with a new id and hides it publicly', () => {
  const store = createStore();
  const event = createValidEvent(store);

  assert.ok(event.id);
  assert.equal(event.status, 'draft');
  assert.equal(event.published, false);
  assert.deepEqual(listEventSummaries(store), []);
  assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);
});

test('S02: missing title or city and an impossible date fail validation without saving', () => {
  const store = createStore();

  for (const invalidEvent of [
    { city: 'Lagos', venue: 'Main Hall', date: '2026-12-05' },
    { title: 'Show', venue: 'Main Hall', date: '2026-12-05' },
    { title: 'Show', city: 'Lagos', venue: 'Main Hall', date: '2026-02-30' },
  ]) {
    assertDomainCode(() => createEvent(store, invalidEvent), 'VALIDATION');
  }
  assert.equal(store.events.size, 0);
});

test('S03: a tier stores a whole-cent price, zero sold, and its full remaining capacity', () => {
  const store = createStore();
  const event = createValidEvent(store);
  const tier = addTier(store, event.id, {
    name: 'General',
    priceCents: 500000,
    capacity: 100,
  });

  assert.equal(tier.priceCents, 500000);
  assert.equal(tier.sold, 0);
  assert.equal(tier.available, 100);
});

test('S03: fractional prices and capacities below one fail validation', () => {
  const store = createStore();
  const event = createValidEvent(store);

  assertDomainCode(
    () => addTier(store, event.id, { name: 'Fractional', priceCents: 1.5, capacity: 1 }),
    'VALIDATION',
  );
  assertDomainCode(
    () => addTier(store, event.id, { name: 'Empty', priceCents: 100, capacity: 0 }),
    'VALIDATION',
  );
});

test('S03: adding a tier to a missing event fails with NOT_FOUND', () => {
  const store = createStore();

  assertDomainCode(
    () => addTier(store, 'missing-event', { name: 'General', priceCents: 100, capacity: 1 }),
    'NOT_FOUND',
  );
});

test('S04: publishing without ticket tiers fails with INVALID_STATE', () => {
  const store = createStore();
  const event = createValidEvent(store);

  assertDomainCode(() => publishEvent(store, event.id), 'INVALID_STATE');
  assert.equal(event.published, false);
});

test('S04: publishing a tiered draft makes it available in the public summaries', () => {
  const store = createStore();
  const event = createValidEvent(store);
  addTier(store, event.id, { name: 'General', priceCents: 2000, capacity: 4 });

  publishEvent(store, event.id);

  const summaries = listEventSummaries(store);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, event.id);
  assert.equal(summaries[0].published, true);
  assert.equal(summaries[0].cheapestTierPriceCents, 2000);
  assert.equal(summaries[0].availableSeats, 4);
});

test('S05: text search matches title or venue without case sensitivity', () => {
  const events = [
    createSummary({ id: 'lagos', title: 'Lagos Tech Meetup' }),
    createSummary({ id: 'abuja', title: 'Abuja Jazz Night', venue: 'Civic Centre' }),
  ];

  assert.deepEqual(filterEvents(events, { q: 'JAZZ' }).map((event) => event.id), ['abuja']);
  assert.deepEqual(filterEvents(events, { q: 'MAIN HALL' }).map((event) => event.id), ['lagos']);
});

test('S05: city filtering is exact apart from letter case', () => {
  const events = [
    createSummary({ id: 'lagos', title: 'Lagos Show', city: 'Lagos' }),
    createSummary({ id: 'abuja', title: 'Abuja Show', city: 'Abuja' }),
  ];

  assert.deepEqual(filterEvents(events, { city: 'lagos' }).map((event) => event.id), ['lagos']);
});

test('S05: maximum price uses the cheapest tier and price sorting puts no-price events last', () => {
  const events = [
    createSummary({
      id: 'higher',
      title: 'Higher',
      tiers: [{ priceCents: 900, available: 1 }, { priceCents: 450, available: 1 }],
    }),
    createSummary({ id: 'lower', title: 'Lower', tiers: [{ priceCents: 300, available: 1 }] }),
    createSummary({ id: 'no-tier', title: 'No tier', tiers: [] }),
  ];

  assert.deepEqual(
    searchEvents(events, { maxPriceCents: 500 }, 'price').map((event) => event.id),
    ['lower', 'higher'],
  );
});

test('S05: date sorting uses earliest date and breaks same-day ties by title', () => {
  const events = [
    createSummary({ id: 'zulu', title: 'Zulu', date: '2026-12-05T09:00:00.000Z' }),
    createSummary({ id: 'later', title: 'Earlier date', date: '2026-12-06T09:00:00.000Z' }),
    createSummary({ id: 'alpha', title: 'Alpha', date: '2026-12-05T18:00:00.000Z' }),
  ];

  assert.deepEqual(sortEvents(events, 'date').map((event) => event.id), ['alpha', 'zulu', 'later']);
});

test('S05: a date-only upper bound includes events throughout that day', () => {
  const event = createSummary({ id: 'evening', title: 'Evening', date: '2026-12-05T17:00:00.000Z' });

  assert.deepEqual(filterEvents([event], { to: '2026-12-05' }), [event]);
});

test('S05: date-only range bounds include the whole starting and ending dates', () => {
  const events = [
    createSummary({ id: 'previous', title: 'Previous', date: '2026-12-04T23:59:59.000Z' }),
    createSummary({ id: 'start', title: 'Start', date: '2026-12-05T00:00:00.000Z' }),
    createSummary({ id: 'end', title: 'End', date: '2026-12-06T23:59:59.000Z' }),
    createSummary({ id: 'after', title: 'After', date: '2026-12-07T00:00:00.000Z' }),
  ];

  assert.deepEqual(
    filterEvents(events, { from: '2026-12-05', to: '2026-12-06' }).map((event) => event.id),
    ['start', 'end'],
  );
});

test('S05: invalid dates, fractional prices, and unknown sorts fail with VALIDATION', () => {
  const events = [createSummary({ id: 'valid', title: 'Valid' })];

  assertDomainCode(() => filterEvents(events, { from: 'not-a-date' }), 'VALIDATION');
  assertDomainCode(() => filterEvents(events, { maxPriceCents: 10.5 }), 'VALIDATION');
  assertDomainCode(() => sortEvents(events, 'popularity'), 'VALIDATION');
});

test('S05: filtering and sorting return new lists without changing the original list', () => {
  const events = [
    createSummary({ id: 'second', title: 'Zulu', date: '2026-12-06T09:00:00.000Z' }),
    createSummary({ id: 'first', title: 'Alpha', date: '2026-12-05T09:00:00.000Z' }),
  ];
  const original = [...events];

  const filtered = filterEvents(events, { city: 'lagos' });
  const sorted = sortEvents(events, 'date');

  assert.notEqual(filtered, events);
  assert.notEqual(sorted, events);
  assert.deepEqual(events, original);
  assert.deepEqual(sorted.map((event) => event.id), ['first', 'second']);
});

test('S05: an empty event list stays empty for filtering, sorting, and searching', () => {
  assert.deepEqual(filterEvents([], { q: 'anything' }), []);
  assert.deepEqual(sortEvents([], 'date'), []);
  assert.deepEqual(searchEvents([], {}, 'price'), []);
});

test('mergeSort returns a stable new array and leaves its input untouched', () => {
  const input = [
    { key: 1, order: 'first' },
    { key: 0, order: 'middle' },
    { key: 1, order: 'second' },
  ];
  const original = [...input];
  const sorted = mergeSort(input, (left, right) => left.key - right.key);

  assert.notEqual(sorted, input);
  assert.deepEqual(sorted.map((item) => item.order), ['middle', 'first', 'second']);
  assert.deepEqual(input, original);
});

test('S05: availability sorting puts the most remaining seats first', () => {
  const events = [
    createSummary({ id: 'few', title: 'Few', tiers: [{ priceCents: 100, available: 1 }] }),
    createSummary({ id: 'many', title: 'Many', tiers: [{ priceCents: 100, available: 5 }] }),
  ];

  assert.deepEqual(sortEvents(events, 'availability').map((event) => event.id), ['many', 'few']);
});

test('S05: onlyAvailable filters out sold-out events', () => {
  const events = [
    createSummary({ id: 'sold-out', title: 'Sold Out', tiers: [{ priceCents: 100, available: 0 }] }),
    createSummary({ id: 'available', title: 'Available', tiers: [{ priceCents: 100, available: 1 }] }),
  ];

  assert.deepEqual(filterEvents(events, { onlyAvailable: true }).map((event) => event.id), ['available']);
});

test('S05: equal date and title sort by id', () => {
  const events = [
    createSummary({ id: 'z-event', title: 'Same title', date: '2026-12-05' }),
    createSummary({ id: 'a-event', title: 'Same title', date: '2026-12-05' }),
  ];

  assert.deepEqual(sortEvents(events, 'date').map((event) => event.id), ['a-event', 'z-event']);
});

test('S06: a published event booking is pending, priced in cents, and reduces availability', () => {
  const store = createStore();
  const event = createValidEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500, capacity: 3 });
  publishEvent(store, event.id);

  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Ada',
    quantity: 2,
  });

  assert.equal(booking.status, 'pending');
  assert.equal(booking.quantity, 2);
  assert.equal(booking.totalCents, 1000);
  assert.equal(tier.available, 1);
  assert.equal(tier.sold, 2);
});

test('S06: a sold-out booking fails without changing inventory or stored bookings', () => {
  const store = createStore();
  const event = createValidEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500, capacity: 3 });
  publishEvent(store, event.id);
  bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 2 });
  const before = { available: tier.available, sold: tier.sold, bookings: store.bookings.size };

  assertDomainCode(
    () => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Bayo', quantity: 2 }),
    'SOLD_OUT',
  );
  assert.deepEqual(
    { available: tier.available, sold: tier.sold, bookings: store.bookings.size },
    before,
  );
});

test('S06: ticket quantities outside 1 through 10 fail with VALIDATION', () => {
  const store = createStore();
  const event = createValidEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500, capacity: 20 });
  publishEvent(store, event.id);

  for (const quantity of [0, -1, 1.5, 11]) {
    assertDomainCode(
      () => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity }),
      'VALIDATION',
    );
  }
  assert.equal(tier.available, 20);
});

test('booking a draft event fails with INVALID_STATE', () => {
  const store = createStore();
  const event = createValidEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500, capacity: 3 });

  assertDomainCode(
    () => bookTickets(store, { eventId: event.id, tierId: tier.id, attendeeName: 'Ada', quantity: 1 }),
    'INVALID_STATE',
  );
  assert.equal(tier.available, 3);
});

test('cancellation restores seats and a second cancellation fails with ALREADY_CANCELLED', () => {
  const store = createStore();
  const event = createValidEvent(store);
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500, capacity: 3 });
  publishEvent(store, event.id);
  const booking = bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Ada',
    quantity: 2,
  });

  cancelBooking(store, booking.id);
  assert.equal(tier.available, 3);
  assert.equal(tier.sold, 0);
  assert.equal(booking.status, 'cancelled');
  assertDomainCode(() => cancelBooking(store, booking.id), 'ALREADY_CANCELLED');
});
