import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

test('SQLite repository keeps events, tiers, and bookings after reopening', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'event-ticketing-db-'));
  const filename = path.join(directory, 'ticketing.sqlite');
  let repository;
  let reopenedRepository;
  t.after(async () => {
    repository?.close();
    reopenedRepository?.close();
    await rm(directory, { recursive: true, force: true });
  });

  const database = openDatabase({ filename });
  repository = createSqliteRepository(database);
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, createMockPaymentGateway());

  const event = await eventService.createEvent('organizer-1', {
    title: 'Persistent Event',
    city: 'Lagos',
    venue: 'Main Hall',
    date: '2027-07-18',
  });
  const tier = await eventService.addTier('organizer-1', event.id, {
    name: 'General',
    priceCents: 500,
    capacity: 2,
  });
  await eventService.publishEvent('organizer-1', event.id);
  const booking = await bookingService.createBooking('attendee-1', {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Ada',
    quantity: 1,
  });
  repository.close();
  repository = null;

  const reopenedDatabase = openDatabase({ filename });
  reopenedRepository = createSqliteRepository(reopenedDatabase);
  assert.equal((await reopenedRepository.getEvent(event.id)).title, 'Persistent Event');
  assert.deepEqual(await reopenedRepository.getTier(tier.id), {
    ...tier,
    available: 1,
    sold: 1,
  });
  assert.equal(
    (await reopenedRepository.getBookingByReference(booking.reference)).userId,
    'attendee-1',
  );
  assert.throws(
    () => reopenedDatabase.prepare(
      'UPDATE ticket_tiers SET sold = ? WHERE id = ?',
    ).run(3, tier.id),
    /CHECK constraint failed/,
  );
});
