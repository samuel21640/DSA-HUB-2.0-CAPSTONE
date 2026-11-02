import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  findBookingByReference,
  joinWaitlist,
  publishEvent,
} from '../src/domain/inventory.js';

const store = createStore();
const event = createEvent(store, {
  title: 'Summer Sounds',
  city: 'Lagos',
  venue: 'City Arena',
  date: '2026-12-05T17:00:00.000Z',
});
const tier = addTier(store, event.id, {
  name: 'General admission',
  priceCents: 2500,
  capacity: 3,
});
publishEvent(store, event.id);

console.log(`Event: ${event.name} (${tier.capacity} seats)`);

const adaBooking = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Ada',
  quantity: 2,
});
console.log(`Ada books 2 tickets. Reference: ${adaBooking.reference}`);

try {
  bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: 'Bayo',
    quantity: 2,
  });
} catch (error) {
  if (error.code !== 'SOLD_OUT') {
    throw error;
  }
  console.log(`Bayo's request for 2 tickets is refused: ${error.code}.`);
}

const bayoBooking = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Bayo',
  quantity: 1,
});
console.log('Bayo books the final ticket; the event is sold out.');

const firstWaitlistEntry = joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Chika',
  quantity: 1,
});
const secondWaitlistEntry = joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: 'Dara',
  quantity: 1,
});
console.log(`${firstWaitlistEntry.attendeeName} and ${secondWaitlistEntry.attendeeName} join the waitlist.`);

const foundBooking = findBookingByReference(store, adaBooking.reference);
console.log(`Lookup by reference found ${foundBooking.attendeeName}'s booking.`);

cancelBooking(store, adaBooking.id);
const nextInLine = store.waitlists.get(tier.id).peek();
console.log(`${adaBooking.attendeeName} cancels. Next in line: ${nextInLine.attendeeName}.`);
console.log(`Bayo's booking remains ${bayoBooking.status}.`);
