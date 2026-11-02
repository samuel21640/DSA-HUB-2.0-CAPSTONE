import { DomainError } from './errors.js';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export function parseISODate(value, label = 'Date') {
  if (typeof value !== 'string') {
    throw new DomainError(`${label} must be an ISO date string.`, 'VALIDATION');
  }

  const parts = ISO_DATE_PATTERN.exec(value);
  if (!parts) {
    throw new DomainError(`${label} must be an ISO date string.`, 'VALIDATION');
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = hourText === undefined ? 0 : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysInMonth = monthLengths[month - 1];

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59) {
    throw new DomainError(`${label} must be a real ISO date.`, 'VALIDATION');
  }

  if (zone && zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59
      || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new DomainError(`${label} has an invalid time-zone offset.`, 'VALIDATION');
    }
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new DomainError(`${label} must be a real ISO date.`, 'VALIDATION');
  }

  return {
    timestamp,
    dateOnly: hourText === undefined,
    day: value.slice(0, 10),
  };
}
