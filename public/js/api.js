import { createMockData } from './mockData.js';

const MAX_TICKETS_PER_BOOKING = 10;
const DEFAULT_HOLD_DURATION_MS = 10 * 60 * 1000;

function apiError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.error = { code, message };
  return error;
}

function copyEvent(event) {
  const tiers = event.tiers.map((tier) => ({ ...tier }));
  return {
    ...event,
    name: event.name ?? event.title,
    status: event.status ?? (event.published ? 'published' : 'draft'),
    tiers,
    cheapestTierPriceCents: tiers.length === 0
      ? null
      : Math.min(...tiers.map((tier) => tier.priceCents)),
    availableSeats: tiers.reduce((sum, tier) => sum + tier.available, 0),
  };
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function cheapestPrice(event) {
  return event.tiers.length === 0
    ? null
    : Math.min(...event.tiers.map((tier) => tier.priceCents));
}

function availableSeats(event) {
  return event.tiers.reduce((sum, tier) => sum + tier.available, 0);
}

function dateTimestamp(value, label, endOfDay = false) {
  const isoPattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
  const datePart = typeof value === 'string' ? value.slice(0, 10) : '';
  const [year, month, day] = datePart.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (typeof value !== 'string' || !isoPattern.test(value)
    || !Number.isFinite(Date.parse(value))
    || calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day) {
    throw apiError('VALIDATION', `${label} date must be a valid ISO date.`);
  }
  if (endOfDay && value.length === 10) {
    return Date.parse(`${value}T23:59:59.999Z`);
  }
  return Date.parse(value);
}

function searchMockEvents(events, criteria) {
  if (criteria === null || typeof criteria !== 'object' || Array.isArray(criteria)) {
    throw apiError('VALIDATION', 'Search criteria must be an object.');
  }
  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;
  const sortBy = criteria.sortBy ?? 'date';
  if (q !== undefined && typeof q !== 'string') {
    throw apiError('VALIDATION', 'Search text must be a string.');
  }
  if (city !== undefined && typeof city !== 'string') {
    throw apiError('VALIDATION', 'City must be a string.');
  }
  if (maxPriceCents !== undefined
    && (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0)) {
    throw apiError('VALIDATION', 'Maximum price must be a non-negative whole number of cents.');
  }
  if (onlyAvailable !== undefined && typeof onlyAvailable !== 'boolean') {
    throw apiError('VALIDATION', 'Only-available must be a boolean.');
  }
  if (!['date', 'price', 'availability'].includes(sortBy)) {
    throw apiError('VALIDATION', `Unknown event sort option "${sortBy}".`);
  }
  const fromTimestamp = from === undefined ? null : dateTimestamp(from, 'From');
  const toTimestamp = to === undefined ? null : dateTimestamp(to, 'To', true);

  const query = q?.trim().toLowerCase();
  const normalizedCity = city?.trim().toLowerCase();
  const filtered = events.filter((event) => {
    const title = (event.title ?? event.name).toLowerCase();
    const venue = event.venue.toLowerCase();
    if (query && !title.includes(query) && !venue.includes(query)) return false;
    if (normalizedCity && event.city.trim().toLowerCase() !== normalizedCity) return false;
    if (fromTimestamp !== null && Date.parse(event.date) < fromTimestamp) return false;
    if (toTimestamp !== null && Date.parse(event.date) > toTimestamp) return false;
    const price = cheapestPrice(event);
    if (maxPriceCents !== undefined && (price === null || price > maxPriceCents)) return false;
    if (onlyAvailable && availableSeats(event) === 0) return false;
    return true;
  });

  return filtered.sort((left, right) => {
    let order = 0;
    if (sortBy === 'date') {
      order = compareText(left.date.slice(0, 10), right.date.slice(0, 10));
    } else if (sortBy === 'price') {
      const leftPrice = cheapestPrice(left);
      const rightPrice = cheapestPrice(right);
      if (leftPrice === null && rightPrice !== null) return 1;
      if (rightPrice === null && leftPrice !== null) return -1;
      if (leftPrice !== null && rightPrice !== null) order = leftPrice - rightPrice;
    } else {
      order = availableSeats(right) - availableSeats(left);
    }
    return order
      || compareText(left.title ?? left.name, right.title ?? right.name)
      || compareText(left.id, right.id);
  });
}

export function createMockApi({ events = createMockData(), holdDurationMs = DEFAULT_HOLD_DURATION_MS } = {}) {
  const data = events.map(copyEvent);
  const bookings = new Map();
  let bookingNumber = 0;

  function findEvent(eventId) {
    return data.find((event) => event.id === eventId);
  }

  function expireHolds() {
    const now = Date.now();
    for (const booking of bookings.values()) {
      if (booking.status !== 'pending' || Date.parse(booking.holdExpiresAt) > now) {
        continue;
      }
      const event = findEvent(booking.eventId);
      const tier = event?.tiers.find((item) => item.id === booking.tierId);
      if (tier) {
        tier.available += booking.quantity;
        tier.sold -= booking.quantity;
      }
      booking.status = 'expired';
    }
  }

  return {
    async listEvents(criteria = {}) {
      expireHolds();
      return searchMockEvents(data.filter((event) => event.published), criteria)
        .map(copyEvent);
    },

    async getEvent(eventId) {
      expireHolds();
      const event = findEvent(eventId);
      if (!event || !event.published) {
        throw apiError('NOT_FOUND', `Event "${eventId}" was not found.`);
      }
      return copyEvent(event);
    },

    async createBooking(input) {
      expireHolds();
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw apiError('VALIDATION', 'Booking must be an object.');
      }
      const { eventId, tierId, attendeeName, quantity } = input;
      if (typeof eventId !== 'string' || eventId.trim() === ''
        || typeof tierId !== 'string' || tierId.trim() === ''
        || typeof attendeeName !== 'string' || attendeeName.trim() === ''
        || !Number.isSafeInteger(quantity) || quantity <= 0
        || quantity > MAX_TICKETS_PER_BOOKING) {
        throw apiError('VALIDATION', 'Enter a name and a whole ticket quantity from 1 to 10.');
      }

      const event = findEvent(eventId);
      if (!event || !event.published) {
        throw apiError('NOT_FOUND', `Event "${eventId}" was not found.`);
      }
      const tier = event.tiers.find((item) => item.id === tierId);
      if (!tier) {
        throw apiError('NOT_FOUND', `Ticket tier "${tierId}" was not found.`);
      }
      if (tier.available < quantity) {
        throw apiError('SOLD_OUT', 'There are not enough tickets remaining.');
      }

      bookingNumber += 1;
      tier.available -= quantity;
      tier.sold += quantity;
      const booking = {
        id: `mock-booking-${bookingNumber}`,
        reference: `MOCK-${String(bookingNumber).padStart(6, '0')}`,
        eventId,
        tierId,
        userId: 'mock-attendee',
        attendeeName: attendeeName.trim(),
        quantity,
        totalCents: tier.priceCents * quantity,
        status: 'pending',
        holdExpiresAt: new Date(Date.now() + holdDurationMs).toISOString(),
      };
      bookings.set(booking.reference, booking);
      return { ...booking };
    },

    async pay(reference, options = {}) {
      expireHolds();
      const booking = bookings.get(reference);
      if (!booking) {
        throw apiError('NOT_FOUND', `Booking reference "${reference}" was not found.`);
      }
      if (booking.status === 'expired') {
        throw apiError('BOOKING_EXPIRED', 'The ticket hold has expired. Please choose tickets again.');
      }
      if (booking.status !== 'pending') {
        throw apiError('INVALID_TRANSITION', `A ${booking.status} booking cannot be paid.`);
      }
      if (options === null || typeof options !== 'object' || Array.isArray(options)
        || (options.decline !== undefined && typeof options.decline !== 'boolean')) {
        throw apiError('VALIDATION', 'Payment options must contain a boolean decline value.');
      }
      if (options.decline === true) {
        throw apiError('PAYMENT_DECLINED', 'The mock payment was declined. You can try again.');
      }
      booking.status = 'paid';
      return { ...booking };
    },
  };
}

const mockApi = createMockApi();

export const listEvents = (...args) => mockApi.listEvents(...args);
export const getEvent = (...args) => mockApi.getEvent(...args);
export const createBooking = (...args) => mockApi.createBooking(...args);
export const pay = (...args) => mockApi.pay(...args);
