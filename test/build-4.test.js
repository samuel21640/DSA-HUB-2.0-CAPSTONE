import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startServer, createServerApp } from '../src/server.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

async function startTestServer(options = {}) {
  const server = startServer({ port: 0, ...options });
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function postJson(baseUrl, route, userId, payload) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      ...(userId ? { 'x-user-id': userId } : {}),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}

test('real API supports creating, publishing, searching, booking, paying, and cancelling', async (t) => {
  const instance = await startTestServer();
  t.after(instance.close);

  const noIdentity = await postJson(instance.baseUrl, '/api/events', undefined, {
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Main Hall',
    date: '2026-12-05',
  });
  assert.equal(noIdentity.status, 401);
  assert.deepEqual(await noIdentity.json(), {
    error: { code: 'UNAUTHENTICATED', message: 'The x-user-id header is required.' },
  });

  const createdResponse = await postJson(instance.baseUrl, '/api/events', 'organizer-1', {
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Main Hall',
    date: '2026-12-05T17:00:00.000Z',
  });
  assert.equal(createdResponse.status, 201);
  const event = await createdResponse.json();
  assert.equal(event.status, 'draft');
  assert.equal(event.published, false);

  const hiddenEvents = await fetch(`${instance.baseUrl}/api/events`);
  assert.deepEqual(await hiddenEvents.json(), []);

  const tierResponse = await postJson(
    instance.baseUrl,
    `/api/events/${event.id}/tiers`,
    'organizer-1',
    { name: 'General', priceCents: 500, capacity: 3 },
  );
  assert.equal(tierResponse.status, 201);
  const tier = await tierResponse.json();
  assert.equal(tier.available, 3);
  assert.equal(tier.sold, 0);

  const publishedResponse = await postJson(
    instance.baseUrl,
    `/api/events/${event.id}/publish`,
    'organizer-1',
  );
  assert.equal(publishedResponse.status, 200);
  assert.equal((await publishedResponse.json()).published, true);

  const searchResponse = await fetch(
    `${instance.baseUrl}/api/events?q=MEETUP&city=lagos&maxPriceCents=500&sortBy=price`,
  );
  assert.equal(searchResponse.status, 200);
  const matchingEvents = await searchResponse.json();
  assert.equal(matchingEvents.length, 1);
  assert.equal(matchingEvents[0].id, event.id);

  const bookingResponse = await postJson(instance.baseUrl, '/api/bookings', 'attendee-1', {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Ada',
    quantity: 2,
  });
  assert.equal(bookingResponse.status, 201);
  const booking = await bookingResponse.json();
  assert.equal(booking.status, 'pending');
  assert.equal(booking.totalCents, 1000);

  const soldOutResponse = await postJson(instance.baseUrl, '/api/bookings', 'attendee-2', {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Bayo',
    quantity: 2,
  });
  assert.equal(soldOutResponse.status, 409);
  assert.equal((await soldOutResponse.json()).error.code, 'SOLD_OUT');

  const otherAttendeePay = await postJson(
    instance.baseUrl,
    `/api/bookings/${booking.reference}/pay`,
    'attendee-2',
    {},
  );
  assert.equal(otherAttendeePay.status, 403);
  assert.equal((await otherAttendeePay.json()).error.code, 'FORBIDDEN');

  const declinedResponse = await postJson(
    instance.baseUrl,
    `/api/bookings/${booking.reference}/pay`,
    'attendee-1',
    { decline: true, cardNumber: 'must-not-reach-gateway' },
  );
  assert.equal(declinedResponse.status, 402);
  assert.equal((await declinedResponse.json()).error.code, 'PAYMENT_DECLINED');

  const paidResponse = await postJson(
    instance.baseUrl,
    `/api/bookings/${booking.reference}/pay`,
    'attendee-1',
    {},
  );
  assert.equal(paidResponse.status, 200);
  assert.equal((await paidResponse.json()).status, 'paid');

  const secondPayment = await postJson(
    instance.baseUrl,
    `/api/bookings/${booking.reference}/pay`,
    'attendee-1',
    {},
  );
  assert.equal(secondPayment.status, 409);
  assert.equal((await secondPayment.json()).error.code, 'INVALID_TRANSITION');

  const paidCancellation = await postJson(
    instance.baseUrl,
    `/api/bookings/${booking.reference}/cancel`,
    'attendee-1',
  );
  assert.equal(paidCancellation.status, 409);
  assert.equal((await paidCancellation.json()).error.code, 'INVALID_STATE');
});

test('declined payment leaves a pending booking and cancellation releases its seats', async (t) => {
  let gatewayInput;
  const paymentGateway = {
    async charge(input) {
      gatewayInput = input;
      return createMockPaymentGateway().charge(input);
    },
  };
  const app = createServerApp({
    repository: createMemoryRepository(),
    paymentGateway,
  });
  const instance = await startTestServer({ app });
  t.after(instance.close);

  const eventResponse = await postJson(instance.baseUrl, '/api/events', 'organizer-1', {
    title: 'Jazz Night',
    city: 'Abuja',
    venue: 'Civic Centre',
    date: '2026-12-05',
  });
  const event = await eventResponse.json();
  const tierResponse = await postJson(
    instance.baseUrl,
    `/api/events/${event.id}/tiers`,
    'organizer-1',
    { name: 'General', priceCents: 2500, capacity: 1 },
  );
  const tier = await tierResponse.json();
  await postJson(instance.baseUrl, `/api/events/${event.id}/publish`, 'organizer-1');
  const bookingResponse = await postJson(instance.baseUrl, '/api/bookings', 'attendee-1', {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Ada',
    quantity: 1,
  });
  const booking = await bookingResponse.json();

  const declined = await postJson(
    instance.baseUrl,
    `/api/bookings/${booking.reference}/pay`,
    'attendee-1',
    { decline: true, cardNumber: 'never-forward-this' },
  );
  assert.equal(declined.status, 402);
  assert.deepEqual(gatewayInput, { decline: true });

  const cancellation = await postJson(
    instance.baseUrl,
    `/api/bookings/${booking.reference}/cancel`,
    'attendee-1',
  );
  assert.equal(cancellation.status, 200);
  assert.equal((await cancellation.json()).status, 'cancelled');

  const events = await fetch(`${instance.baseUrl}/api/events?onlyAvailable=true`);
  const availableEvent = (await events.json()).find((item) => item.id === event.id);
  assert.equal(availableEvent.tiers[0].available, 1);
});

test('event creation and booking validation errors use the standard JSON error shape', async (t) => {
  const instance = await startTestServer();
  t.after(instance.close);

  const invalidEvent = await postJson(instance.baseUrl, '/api/events', 'organizer-1', {
    title: 'Missing required data',
  });
  assert.equal(invalidEvent.status, 400);
  const payload = await invalidEvent.json();
  assert.equal(payload.error.code, 'VALIDATION');
  assert.equal(typeof payload.error.message, 'string');
  assert.equal(JSON.stringify(payload).includes('stack'), false);

  const invalidQuantity = await postJson(instance.baseUrl, '/api/bookings', 'attendee-1', {
    eventId: 'missing-event',
    tierId: 'missing-tier',
    attendeeName: 'Ada',
    quantity: 0,
  });
  assert.equal(invalidQuantity.status, 400);
  assert.equal((await invalidQuantity.json()).error.code, 'VALIDATION');
});
