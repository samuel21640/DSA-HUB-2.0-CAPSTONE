import { DomainError } from './errors.js';
import { parseISODate } from './dates.js';
import { mergeSort } from './sorting.js';

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(`${label} must be an object.`, 'VALIDATION');
  }
}

function validateSummaries(summaries) {
  if (!Array.isArray(summaries)) {
    throw new DomainError('Event summaries must be an array.', 'VALIDATION');
  }

  return summaries.map((summary) => {
    requireRecord(summary, 'Event summary');
    const title = summary.title ?? summary.name;

    if (typeof title !== 'string' || title.trim().length === 0
      || typeof summary.venue !== 'string'
      || typeof summary.city !== 'string'
      || typeof summary.id !== 'string' || summary.id.trim().length === 0) {
      throw new DomainError('Event summaries require an id, title, city, and venue.', 'VALIDATION');
    }

    const date = parseISODate(summary.date, 'Event date');
    if (summary.tiers !== undefined && !Array.isArray(summary.tiers)) {
      throw new DomainError('Event tiers must be an array.', 'VALIDATION');
    }

    const tiers = summary.tiers ?? [];
    for (const tier of tiers) {
      requireRecord(tier, 'Ticket tier');
      if (!Number.isSafeInteger(tier.priceCents) || tier.priceCents < 0
        || !Number.isSafeInteger(tier.available) || tier.available < 0) {
        throw new DomainError('Ticket tiers require a whole-cent price and non-negative availability.', 'VALIDATION');
      }
    }

    return { summary, title, date, tiers };
  });
}

function cheapestPrice(tiers) {
  if (tiers.length === 0) {
    return null;
  }

  let cheapest = tiers[0].priceCents;
  for (let index = 1; index < tiers.length; index += 1) {
    if (tiers[index].priceCents < cheapest) {
      cheapest = tiers[index].priceCents;
    }
  }
  return cheapest;
}

function availableSeats(tiers) {
  return tiers.reduce((total, tier) => total + tier.available, 0);
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareTitles(left, right) {
  return compareStrings(left.title, right.title)
    || compareStrings(left.summary.id, right.summary.id);
}

export function filterEvents(summaries, criteria = {}) {
  const events = validateSummaries(summaries);
  requireRecord(criteria, 'Search criteria');

  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;
  if (q !== undefined && typeof q !== 'string') {
    throw new DomainError('Search text must be a string.', 'VALIDATION');
  }
  if (city !== undefined && typeof city !== 'string') {
    throw new DomainError('City must be a string.', 'VALIDATION');
  }
  const fromDate = from === undefined ? null : parseISODate(from, 'From date');
  const toDate = to === undefined ? null : parseISODate(to, 'To date');

  if (maxPriceCents !== undefined
    && (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0)) {
    throw new DomainError('Maximum price must be a non-negative whole number of cents.', 'VALIDATION');
  }
  if (onlyAvailable !== undefined && typeof onlyAvailable !== 'boolean') {
    throw new DomainError('Only-available must be a boolean.', 'VALIDATION');
  }

  const query = q?.trim().toLowerCase();
  const normalizedCity = city?.trim().toLowerCase();
  return events
    .filter(({ summary, title, date, tiers }) => {
      if (query && !title.toLowerCase().includes(query)
        && !summary.venue.toLowerCase().includes(query)) {
        return false;
      }
      if (normalizedCity && summary.city.trim().toLowerCase() !== normalizedCity) {
        return false;
      }
      if (fromDate && (fromDate.dateOnly
        ? date.day < fromDate.day
        : date.timestamp < fromDate.timestamp)) {
        return false;
      }
      if (toDate && (toDate.dateOnly
        ? date.day > toDate.day
        : date.timestamp > toDate.timestamp)) {
        return false;
      }
      if (maxPriceCents !== undefined) {
        const price = cheapestPrice(tiers);
        if (price === null || price > maxPriceCents) {
          return false;
        }
      }
      if (onlyAvailable && availableSeats(tiers) <= 0) {
        return false;
      }
      return true;
    })
    .map(({ summary }) => summary);
}

export function sortEvents(summaries, sortBy) {
  const events = validateSummaries(summaries);
  if (!['date', 'price', 'availability'].includes(sortBy)) {
    throw new DomainError(`Unknown event sort option "${sortBy}".`, 'VALIDATION');
  }

  const compare = (left, right) => {
    let result = 0;
    if (sortBy === 'date') {
      result = compareStrings(left.date.day, right.date.day);
    } else if (sortBy === 'price') {
      const leftPrice = cheapestPrice(left.tiers);
      const rightPrice = cheapestPrice(right.tiers);
      if (leftPrice === null && rightPrice !== null) return 1;
      if (rightPrice === null && leftPrice !== null) return -1;
      if (leftPrice !== null && rightPrice !== null) {
        result = leftPrice - rightPrice;
      }
    } else {
      result = availableSeats(right.tiers) - availableSeats(left.tiers);
    }

    return result || compareTitles(left, right);
  };

  return mergeSort(events, compare).map(({ summary }) => summary);
}

export function searchEvents(summaries, criteria, sortBy) {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
