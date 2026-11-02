import { performance } from 'node:perf_hooks';
import { newId, newReference } from '../src/domain/ids.js';

const BOOKINGS = 100_000;
const LOOKUPS = 500;
const bookings = [];
const bookingsByReference = new Map();

for (let index = 0; index < BOOKINGS; index += 1) {
  const booking = {
    id: newId(),
    reference: newReference(),
  };
  bookings.push(booking);
  bookingsByReference.set(booking.reference, booking);
}

const targets = Array.from(
  { length: LOOKUPS },
  (_, index) => bookings[(index * Math.floor(BOOKINGS / LOOKUPS))].reference,
);

let result;
const arrayStart = performance.now();
for (const reference of targets) {
  result = bookings.find((booking) => booking.reference === reference);
}
const arrayElapsed = performance.now() - arrayStart;

const mapStart = performance.now();
for (const reference of targets) {
  result = bookingsByReference.get(reference);
}
const mapElapsed = performance.now() - mapStart;

if (!result) {
  throw new Error('Benchmark lookup failed to find a booking.');
}

console.log(`Bookings: ${BOOKINGS.toLocaleString()} | Lookups: ${LOOKUPS.toLocaleString()}`);
console.log(`Array.find: ${arrayElapsed.toFixed(3)} ms`);
console.log(`Map.get:    ${mapElapsed.toFixed(3)} ms`);
