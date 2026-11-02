import { DomainError } from './errors.js';
import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';

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
  const name = requireNonEmptyString(input.name, 'Event name');
  const event = {
    id: newId(),
    name,
    tiers: new Map(),
  };

  store.events.set(event.id, event);
  return event;
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
    status: 'active',
  };

  while (store.bookingsByReference.has(booking.reference)) {
    booking.reference = newReference();
  }

  tier.available -= quantity;
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
  if (booking.status !== 'active') {
    throw new DomainError('Booking has already been cancelled.', 'ALREADY_CANCELLED');
  }

  const event = getEvent(store, booking.eventId);
  const tier = getTier(store, event, booking.tierId);
  if (tier.available + booking.quantity > tier.capacity) {
    throw new DomainError('Cancelling would exceed the ticket tier capacity.', 'INVARIANT');
  }

  tier.available += booking.quantity;
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
