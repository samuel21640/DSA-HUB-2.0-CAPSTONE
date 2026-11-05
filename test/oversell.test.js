import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

test('50 simultaneous SQLite bookings for the last seat allow exactly one booking', async (t) => {
  const database = openDatabase({ filename: ':memory:' });
  const repository = createSqliteRepository(database);
  t.after(() => repository.close());

  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, createMockPaymentGateway());
  const organizerId = 'oversell-organizer';
  const event = await eventService.createEvent(organizerId, {
    title: 'Last Seat',
    city: 'Lagos',
    venue: 'Test Hall',
    date: '2027-07-18T17:00:00.000Z',
  });
  const tier = await eventService.addTier(organizerId, event.id, {
    name: 'General admission',
    priceCents: 2500,
    capacity: 1,
  });
  await eventService.publishEvent(organizerId, event.id);

  const results = await Promise.allSettled(Array.from({ length: 50 }, (_, index) => (
    bookingService.createBooking(`attendee-${index}`, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: `Attendee ${index + 1}`,
      quantity: 1,
    })
  )));
  const successful = results.filter((result) => result.status === 'fulfilled');
  const soldOut = results.filter((result) => result.status === 'rejected'
    && result.reason.code === 'SOLD_OUT');

  assert.equal(successful.length, 1);
  assert.equal(soldOut.length, 49);
  assert.equal((await repository.getTier(tier.id)).sold, 1);
  assert.equal((await repository.listTiersForEvent(event.id))[0].available, 0);
});
