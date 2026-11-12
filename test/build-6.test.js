import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from '../public/js/api.js';
import { createMockData } from '../public/js/mockData.js';

test('mock event listing searches, filters by city and price, and sorts without changing source data', async () => {
  const source = createMockData();
  const original = JSON.stringify(source);
  const api = createMockApi({ events: source });

  const jazzEvents = await api.listEvents({ q: 'JAZZ', city: 'abuja' });
  assert.deepEqual(jazzEvents.map((event) => event.title), ['Abuja Jazz Night']);

  const affordable = await api.listEvents({
    maxPriceCents: 125000,
    sortBy: 'price',
  });
  assert.deepEqual(
    affordable.map((event) => event.id),
    ['event-ibadan-food', 'event-kano-design', 'event-port-harcourt-art'],
  );
  assert.equal(JSON.stringify(source), original);

  const returnedEvent = await api.getEvent('event-lagos-tech');
  returnedEvent.tiers[0].available = 0;
  assert.equal((await api.getEvent('event-lagos-tech')).tiers[0].available, 84);
});

test('booking validates quantities, holds available seats, and returns a whole-cent total', async () => {
  const api = createMockApi();
  for (const quantity of [0, 1.5, 11]) {
    await assert.rejects(
      api.createBooking({
        eventId: 'event-lagos-tech',
        tierId: 'tier-lagos-general',
        attendeeName: 'Ada',
        quantity,
      }),
      (error) => error.code === 'VALIDATION',
    );
  }

  await assert.rejects(
    api.createBooking({
      eventId: 'event-lagos-tech',
      tierId: 'tier-lagos-vip',
      attendeeName: 'Ada',
      quantity: 1,
    }),
    (error) => error.code === 'SOLD_OUT',
  );

  const booking = await api.createBooking({
    eventId: 'event-lagos-tech',
    tierId: 'tier-lagos-general',
    attendeeName: ' Ada ',
    quantity: 2,
  });
  assert.equal(booking.status, 'pending');
  assert.equal(booking.attendeeName, 'Ada');
  assert.equal(booking.totalCents, 500000);
  assert.equal((await api.getEvent('event-lagos-tech')).tiers[0].available, 82);
  assert.equal(Number.isFinite(Date.parse(booking.holdExpiresAt)), true);
});

test('a declined mock payment leaves the booking pending so payment can be retried', async () => {
  const api = createMockApi();
  const booking = await api.createBooking({
    eventId: 'event-abuja-jazz',
    tierId: 'tier-abuja-general',
    attendeeName: 'Ada',
    quantity: 1,
  });

  await assert.rejects(
    api.pay(booking.reference, { decline: true }),
    (error) => error.code === 'PAYMENT_DECLINED',
  );
  const paidBooking = await api.pay(booking.reference);
  assert.equal(paidBooking.status, 'paid');
  await assert.rejects(
    api.pay(booking.reference),
    (error) => error.code === 'INVALID_TRANSITION',
  );
});

test('an expired hold releases its seats and cannot be paid', async () => {
  const api = createMockApi({ holdDurationMs: 1 });
  const booking = await api.createBooking({
    eventId: 'event-ibadan-food',
    tierId: 'tier-ibadan-entry',
    attendeeName: 'Ada',
    quantity: 2,
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  await assert.rejects(
    api.pay(booking.reference),
    (error) => error.code === 'BOOKING_EXPIRED',
  );
  assert.equal((await api.getEvent('event-ibadan-food')).tiers[0].available, 197);
});
