import { DomainError } from './errors.js';
import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';
import { parseISODate } from './dates.js';

const MAX_TICKETS_PER_BOOKING = 10;

function invalid(message) {
  throw new DomainError(message, 'VALIDATION');
}

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object.`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    invalid(`${label} must be a positive whole number.`);
  }
  return value;
}

function requireStore(store) {
  requireRecord(store, 'Store');
  if (!(store.events instanceof Map)
    || !(store.bookings instanceof Map)
    || !(store.bookingsByReference instanceof Map)
    || !(store.waitlists instanceof Map)) {
    invalid('Store was not created by createStore().');
  }
}

function getEvent(store, eventId) {
  const id = requireNonEmptyString(eventId, 'Event id');
  const event = store.events.get(id);
  if (!event) {
    throw new DomainError(`Event "${id}" was not found.`, 'NOT_FOUND');
  }
  return event;
}

function getTier(store, event, tierId) {
  const id = requireNonEmptyString(tierId, 'Tier id');
  const tier = event.tiers.get(id);
  if (!tier) {
    throw new DomainError(`Tier "${id}" was not found.`, 'NOT_FOUND');
  }
  return tier;
}

function getWaitlist(store, tierId) {
  let queue = store.waitlists.get(tierId);
  if (!queue) {
    queue = new Queue();
    store.waitlists.set(tierId, queue);
  }
  return queue;
}

export function createStore() {
  return {
    events: new Map(),
    bookings: new Map(),
    bookingsByReference: new Map(),
    waitlists: new Map(),
  };
}

export function createEvent(store, input) {
  requireStore(store);
  requireRecord(input, 'Event');
  const title = requireNonEmptyString(input.title, 'Event title');
  const city = requireNonEmptyString(input.city, 'Event city');
  const venue = requireNonEmptyString(input.venue, 'Event venue');
  const date = requireNonEmptyString(input.date, 'Event date');
  parseISODate(date, 'Event date');
  const event = {
    id: newId(),
    title,
    name: title,
    city,
    venue,
    date,
    published: false,
    status: 'draft',
    tiers: new Map(),
  };

  store.events.set(event.id, event);
  return event;
}

export function publishEvent(store, eventId) {
  requireStore(store);
  const event = getEvent(store, eventId);
  if (event.tiers.size === 0) {
    throw new DomainError('An event needs at least one ticket tier before it can be published.', 'INVALID_STATE');
  }

  event.published = true;
  event.status = 'published';
  return event;
}

export function listEventSummaries(store, options = {}) {
  requireStore(store);
  requireRecord(options, 'Summary options');
  const { publishedOnly = true } = options;
  if (typeof publishedOnly !== 'boolean') {
    invalid('publishedOnly must be a boolean.');
  }

  const summaries = [];
  for (const event of store.events.values()) {
    if (publishedOnly && !event.published) {
      continue;
    }

    const tiers = Array.from(event.tiers.values(), (tier) => ({ ...tier }));
    let cheapestTierPriceCents = null;
    let availableSeats = 0;
    for (const tier of tiers) {
      if (cheapestTierPriceCents === null || tier.priceCents < cheapestTierPriceCents) {
        cheapestTierPriceCents = tier.priceCents;
      }
      availableSeats += tier.available;
    }

    summaries.push({
      id: event.id,
      title: event.title,
      name: event.name,
      city: event.city,
      venue: event.venue,
      date: event.date,
      published: event.published,
      status: event.status,
      tiers,
      cheapestTierPriceCents,
      availableSeats,
    });
  }
  return summaries;
}

export function addTier(store, eventId, input) {
  requireStore(store);
  requireRecord(input, 'Ticket tier');
  const event = getEvent(store, eventId);
  const name = requireNonEmptyString(input.name, 'Tier name');
  const priceCents = input.priceCents;
  const capacity = requirePositiveInteger(input.capacity, 'Capacity');

  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    invalid('Price must be a whole number of cents greater than or equal to zero.');
  }

  const tier = {
    id: newId(),
    eventId: event.id,
    name,
    priceCents,
    capacity,
    available: capacity,
    sold: 0,
  };

  event.tiers.set(tier.id, tier);
  return tier;
}

export function bookTickets(store, input) {
  requireStore(store);
  requireRecord(input, 'Booking');
  const event = getEvent(store, input.eventId);
  const tier = getTier(store, event, input.tierId);
  const attendeeName = requireNonEmptyString(input.attendeeName, 'Attendee name');
  const quantity = requirePositiveInteger(input.quantity, 'Ticket quantity');

  if (!event.published) {
    throw new DomainError('Tickets cannot be booked before the event is published.', 'INVALID_STATE');
  }
  if (quantity > MAX_TICKETS_PER_BOOKING) {
    invalid(`A booking cannot contain more than ${MAX_TICKETS_PER_BOOKING} tickets.`);
  }

  const totalCents = tier.priceCents * quantity;
  if (!Number.isSafeInteger(totalCents)) {
    invalid('Booking total exceeds the supported whole-cent amount.');
  }

  if (tier.available < quantity) {
    throw new DomainError(
      `Only ${tier.available} ticket(s) remain in "${tier.name}".`,
      'SOLD_OUT',
    );
  }

  const booking = {
    id: newId(),
    reference: newReference(),
    eventId: event.id,
    tierId: tier.id,
    attendeeName,
    quantity,
    totalCents,
    status: 'pending',
  };

  while (store.bookingsByReference.has(booking.reference)) {
    booking.reference = newReference();
  }

  tier.available -= quantity;
  tier.sold += quantity;
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(booking.reference, booking);
  return booking;
}

export function cancelBooking(store, bookingId) {
  requireStore(store);
  const id = requireNonEmptyString(bookingId, 'Booking id');
  const booking = store.bookings.get(id);
  if (!booking) {
    throw new DomainError(`Booking "${id}" was not found.`, 'NOT_FOUND');
  }
  if (booking.status === 'cancelled') {
    throw new DomainError('Booking has already been cancelled.', 'ALREADY_CANCELLED');
  }
  if (booking.status !== 'pending' && booking.status !== 'active') {
    throw new DomainError('Booking cannot be cancelled in its current state.', 'INVALID_STATE');
  }

  const event = getEvent(store, booking.eventId);
  const tier = getTier(store, event, booking.tierId);
  if (tier.available + booking.quantity > tier.capacity) {
    throw new DomainError('Cancelling would exceed the ticket tier capacity.', 'INVARIANT');
  }

  tier.available += booking.quantity;
  tier.sold -= booking.quantity;
  booking.status = 'cancelled';
  return booking;
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  const code = requireNonEmptyString(reference, 'Booking reference');
  const booking = store.bookingsByReference.get(code);
  if (!booking) {
    throw new DomainError(`Booking reference "${code}" was not found.`, 'NOT_FOUND');
  }
  return booking;
}

export function joinWaitlist(store, input) {
  requireStore(store);
  requireRecord(input, 'Waitlist entry');
  const event = getEvent(store, input.eventId);
  const tier = getTier(store, event, input.tierId);
  const attendeeName = requireNonEmptyString(input.attendeeName, 'Attendee name');
  const quantity = requirePositiveInteger(input.quantity, 'Ticket quantity');

  if (quantity > MAX_TICKETS_PER_BOOKING) {
    invalid(`A waitlist request cannot contain more than ${MAX_TICKETS_PER_BOOKING} tickets.`);
  }
  if (tier.available >= quantity) {
    throw new DomainError('Tickets are still available for this request.', 'WAITLIST_NOT_NEEDED');
  }

  const entry = {
    id: newId(),
    eventId: event.id,
    tierId: tier.id,
    attendeeName,
    quantity,
  };

  getWaitlist(store, tier.id).enqueue(entry);
  return entry;
}
