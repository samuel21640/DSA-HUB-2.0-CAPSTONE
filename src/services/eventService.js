import { parseISODate } from '../domain/dates.js';
import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { searchEvents } from '../domain/eventSearch.js';

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(`${label} must be an object.`, 'VALIDATION');
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError(`${label} must be a non-empty string.`, 'VALIDATION');
  }
  return value.trim();
}

async function findOwnedEvent(repository, eventId, userId) {
  const event = await repository.getEvent(eventId);
  if (!event) {
    throw new DomainError(`Event "${eventId}" was not found.`, 'NOT_FOUND');
  }
  if (event.organizerId !== userId) {
    throw new DomainError('Only the event organizer can change this event.', 'FORBIDDEN');
  }
  return event;
}

function eventView(event, tiers) {
  return {
    ...event,
    tiers,
    cheapestTierPriceCents: tiers.length === 0
      ? null
      : Math.min(...tiers.map((tier) => tier.priceCents)),
    availableSeats: tiers.reduce((total, tier) => total + tier.available, 0),
  };
}

export function createEventService(repository) {
  return {
    async createEvent(userId, input) {
      requireNonEmptyString(userId, 'User id');
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
        organizerId: userId,
        published: false,
        status: 'draft',
      };
      await repository.saveEvent(event);
      return eventView(event, []);
    },

    async addTier(userId, eventId, input) {
      requireNonEmptyString(userId, 'User id');
      requireRecord(input, 'Ticket tier');
      const event = await findOwnedEvent(repository, eventId, userId);
      const name = requireNonEmptyString(input.name, 'Tier name');
      const { priceCents, capacity } = input;

      if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
        throw new DomainError(
          'Price must be a whole number of cents greater than or equal to zero.',
          'VALIDATION',
        );
      }
      if (!Number.isSafeInteger(capacity) || capacity <= 0) {
        throw new DomainError('Capacity must be a positive whole number.', 'VALIDATION');
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
      await repository.saveTier(tier);
      return tier;
    },

    async publishEvent(userId, eventId) {
      requireNonEmptyString(userId, 'User id');
      const event = await findOwnedEvent(repository, eventId, userId);
      const tiers = await repository.listTiersForEvent(event.id);
      if (tiers.length === 0) {
        throw new DomainError(
          'An event needs at least one ticket tier before it can be published.',
          'INVALID_STATE',
        );
      }
      event.published = true;
      event.status = 'published';
      await repository.saveEvent(event);
      return eventView(event, tiers);
    },

    async searchEvents(query = {}) {
      const criteria = { ...query };
      if (criteria.maxPriceCents !== undefined) {
        if (!/^\d+$/.test(criteria.maxPriceCents)) {
          throw new DomainError('Maximum price must be a whole number of cents.', 'VALIDATION');
        }
        criteria.maxPriceCents = Number(criteria.maxPriceCents);
      }
      if (criteria.onlyAvailable !== undefined) {
        if (!['true', 'false'].includes(criteria.onlyAvailable)) {
          throw new DomainError('onlyAvailable must be true or false.', 'VALIDATION');
        }
        criteria.onlyAvailable = criteria.onlyAvailable === 'true';
      }

      const events = await repository.listEvents();
      const summaries = await Promise.all(events
        .filter((event) => event.published)
        .map(async (event) => eventView(
          event,
          await repository.listTiersForEvent(event.id),
        )));
      const sortBy = criteria.sortBy ?? 'date';
      delete criteria.sortBy;
      return searchEvents(summaries, criteria, sortBy);
    },
  };
}
