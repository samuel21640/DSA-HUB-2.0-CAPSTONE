import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { newId, newReference } from '../src/domain/ids.js';

const database = openDatabase({ filename: ':memory:' });
const repository = createSqliteRepository(database);

try {
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, createMockPaymentGateway());
  const organizerId = 'demo-organizer';
  const event = await eventService.createEvent(organizerId, {
    title: 'Last Ticket Race',
    city: 'Lagos',
    venue: 'Demo Hall',
    date: '2027-07-18T17:00:00.000Z',
  });
  const tier = await eventService.addTier(organizerId, event.id, {
    name: 'General admission',
    priceCents: 2500,
    capacity: 50,
  });

  for (const [index, quantity] of [10, 10, 10, 10, 9].entries()) {
    await repository.saveBooking({
      id: newId(),
      reference: newReference(),
      eventId: event.id,
      tierId: tier.id,
      userId: `existing-attendee-${index}`,
      attendeeName: `Existing attendee ${index + 1}`,
      quantity,
      totalCents: tier.priceCents * quantity,
      status: 'paid',
    });
  }

  await repository.saveTier({ ...tier, sold: 49, available: 1 });
  await eventService.publishEvent(organizerId, event.id);

  const results = await Promise.allSettled(Array.from({ length: 50 }, (_, index) => (
    bookingService.createBooking(`attendee-${index}`, {
      eventId: event.id,
      tierId: tier.id,
      attendeeName: `Attendee ${index + 1}`,
      quantity: 1,
    })
  )));
  const successful = results.filter((result) => result.status === 'fulfilled').length;
  const soldOut = results.filter((result) => result.status === 'rejected'
    && result.reason.code === 'SOLD_OUT').length;
  const seatsSold = database.prepare(
    'SELECT COALESCE(SUM(quantity), 0) AS count FROM bookings WHERE tier_id = ?',
  ).get(tier.id).count;
  const updatedTier = await repository.getTier(tier.id);

  console.log(`Bookings succeeded: ${successful}`);
  console.log(`Bookings rejected as SOLD_OUT: ${soldOut}`);
  console.log(`Seats sold in booking records: ${seatsSold} / ${tier.capacity}`);
  console.log(`Tier sold counter: ${updatedTier.sold} / ${tier.capacity}`);
} finally {
  repository.close();
}
