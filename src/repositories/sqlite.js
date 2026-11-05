import { openDatabase } from '../db/connection.js';
import { DomainError } from '../domain/errors.js';

function mapEvent(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    name: row.title,
    city: row.city,
    venue: row.venue,
    date: row.date,
    organizerId: row.organizer_id,
    published: row.published === 1,
    status: row.status,
  };
}

function mapTier(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    available: row.available,
    sold: row.sold,
  };
}

function mapBooking(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    reference: row.reference,
    eventId: row.event_id,
    tierId: row.tier_id,
    userId: row.user_id,
    attendeeName: row.attendee_name,
    quantity: row.quantity,
    totalCents: row.total_cents,
    status: row.status,
  };
}

export function createSqliteRepository(database = openDatabase()) {
  const insertUser = database.prepare(`
    INSERT INTO users (id, name, email)
    VALUES (?, ?, NULL)
    ON CONFLICT (id) DO NOTHING
  `);
  const saveEvent = database.prepare(`
    INSERT INTO events (id, title, city, venue, date, organizer_id, published, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = excluded.title,
      city = excluded.city,
      venue = excluded.venue,
      date = excluded.date,
      organizer_id = excluded.organizer_id,
      published = excluded.published,
      status = excluded.status
  `);
  const getEvent = database.prepare('SELECT * FROM events WHERE id = ?');
  const listEvents = database.prepare('SELECT * FROM events ORDER BY rowid');
  const saveTier = database.prepare(`
    INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, available, sold)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      event_id = excluded.event_id,
      name = excluded.name,
      price_cents = excluded.price_cents,
      capacity = excluded.capacity,
      available = excluded.available,
      sold = excluded.sold
  `);
  const getTier = database.prepare('SELECT * FROM ticket_tiers WHERE id = ?');
  const reserveTierSeats = database.prepare(`
    UPDATE ticket_tiers
    SET sold = sold + ?, available = available - ?
    WHERE id = ? AND sold + ? <= capacity
  `);
  const listTiersForEvent = database.prepare(
    'SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY rowid',
  );
  const saveBooking = database.prepare(`
    INSERT INTO bookings (
      id, reference, event_id, tier_id, user_id, attendee_name, quantity, total_cents, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (reference) DO UPDATE SET
      id = excluded.id,
      event_id = excluded.event_id,
      tier_id = excluded.tier_id,
      user_id = excluded.user_id,
      attendee_name = excluded.attendee_name,
      quantity = excluded.quantity,
      total_cents = excluded.total_cents,
      status = excluded.status
  `);
  const getBookingByReference = database.prepare('SELECT * FROM bookings WHERE reference = ?');

  return {
    async saveEvent(event) {
      insertUser.run(event.organizerId, 'Organizer');
      saveEvent.run(
        event.id,
        event.title ?? event.name,
        event.city,
        event.venue,
        event.date,
        event.organizerId,
        event.published ? 1 : 0,
        event.status,
      );
      return { ...event };
    },

    async getEvent(id) {
      return mapEvent(getEvent.get(id));
    },

    async listEvents() {
      return listEvents.all().map(mapEvent);
    },

    async saveTier(tier) {
      saveTier.run(
        tier.id,
        tier.eventId,
        tier.name,
        tier.priceCents,
        tier.capacity,
        tier.available,
        tier.sold,
      );
      return { ...tier };
    },

    async getTier(id) {
      return mapTier(getTier.get(id));
    },

    async reserveTierSeats(id, quantity) {
      const result = reserveTierSeats.run(quantity, quantity, id, quantity);
      if (result.changes === 0) {
        throw new DomainError('There are not enough tickets remaining.', 'SOLD_OUT');
      }
      return mapTier(getTier.get(id));
    },

    async listTiersForEvent(eventId) {
      return listTiersForEvent.all(eventId).map(mapTier);
    },

    async saveBooking(booking) {
      insertUser.run(booking.userId, booking.attendeeName);
      saveBooking.run(
        booking.id,
        booking.reference,
        booking.eventId,
        booking.tierId,
        booking.userId,
        booking.attendeeName,
        booking.quantity,
        booking.totalCents,
        booking.status,
      );
      return { ...booking };
    },

    async getBookingByReference(reference) {
      return mapBooking(getBookingByReference.get(reference));
    },

    close() {
      database.close();
    },
  };
}
