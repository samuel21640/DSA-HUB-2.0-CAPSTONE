import { assertTransition } from '../domain/bookingStateMachine.js';
import { DomainError } from '../domain/errors.js';
import { newId, newReference } from '../domain/ids.js';

const MAX_TICKETS_PER_BOOKING = 10;

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError(`${label} must be a non-empty string.`, 'VALIDATION');
  }
  return value.trim();
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError(`${label} must be a positive whole number.`, 'VALIDATION');
  }
  return value;
}

async function findOwnedBooking(repository, reference, userId) {
  const code = requireNonEmptyString(reference, 'Booking reference');
  const booking = await repository.getBookingByReference(code);
  if (!booking) {
    throw new DomainError(`Booking reference "${code}" was not found.`, 'NOT_FOUND');
  }
  if (booking.userId !== userId) {
    throw new DomainError('Only the attendee who made this booking can change it.', 'FORBIDDEN');
  }
  return booking;
}

export function createBookingService(repository, paymentGateway) {
  return {
    async createBooking(userId, input) {
      const attendeeId = requireNonEmptyString(userId, 'User id');
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new DomainError('Booking must be an object.', 'VALIDATION');
      }
      const eventId = requireNonEmptyString(input.eventId, 'Event id');
      const tierId = requireNonEmptyString(input.tierId, 'Tier id');
      const attendeeName = requireNonEmptyString(input.attendeeName, 'Attendee name');
      const quantity = requirePositiveInteger(input.quantity, 'Ticket quantity');
      if (quantity > MAX_TICKETS_PER_BOOKING) {
        throw new DomainError(
          `A booking cannot contain more than ${MAX_TICKETS_PER_BOOKING} tickets.`,
          'VALIDATION',
        );
      }

      const event = await repository.getEvent(eventId);
      if (!event) {
        throw new DomainError(`Event "${eventId}" was not found.`, 'NOT_FOUND');
      }
      if (!event.published) {
        throw new DomainError('Tickets cannot be booked before the event is published.', 'INVALID_STATE');
      }
      const tier = await repository.getTier(tierId);
      if (!tier || tier.eventId !== event.id) {
        throw new DomainError(`Tier "${tierId}" was not found.`, 'NOT_FOUND');
      }
      if (tier.available < quantity) {
        throw new DomainError(
          `Only ${tier.available} ticket(s) remain in "${tier.name}".`,
          'SOLD_OUT',
        );
      }

      const totalCents = tier.priceCents * quantity;
      if (!Number.isSafeInteger(totalCents)) {
        throw new DomainError('Booking total exceeds the supported whole-cent amount.', 'VALIDATION');
      }

      let reference = newReference();
      while (await repository.getBookingByReference(reference)) {
        reference = newReference();
      }
      const booking = {
        id: newId(),
        reference,
        eventId: event.id,
        tierId: tier.id,
        userId: attendeeId,
        attendeeName,
        quantity,
        totalCents,
        status: 'pending',
      };

      tier.available -= quantity;
      tier.sold += quantity;
      await repository.saveTier(tier);
      await repository.saveBooking(booking);
      return booking;
    },

    async payBooking(userId, reference, input = {}) {
      const attendeeId = requireNonEmptyString(userId, 'User id');
      const booking = await findOwnedBooking(repository, reference, attendeeId);
      assertTransition(booking.status, 'paid');

      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new DomainError('Payment options must be an object.', 'VALIDATION');
      }
      if (input.decline !== undefined && typeof input.decline !== 'boolean') {
        throw new DomainError('decline must be a boolean.', 'VALIDATION');
      }

      const result = await paymentGateway.charge({ decline: input.decline === true });
      if (result.status === 'declined') {
        throw new DomainError('The mock payment was declined.', 'PAYMENT_DECLINED');
      }
      if (result.status !== 'success') {
        throw new DomainError('The payment gateway returned an invalid response.', 'PAYMENT_ERROR');
      }

      booking.status = 'paid';
      await repository.saveBooking(booking);
      return booking;
    },

    async cancelBooking(userId, reference) {
      const attendeeId = requireNonEmptyString(userId, 'User id');
      const booking = await findOwnedBooking(repository, reference, attendeeId);
      if (booking.status !== 'pending') {
        throw new DomainError('Only unpaid bookings can be cancelled in this build.', 'INVALID_STATE');
      }
      assertTransition(booking.status, 'cancelled');

      const tier = await repository.getTier(booking.tierId);
      if (!tier) {
        throw new DomainError(`Tier "${booking.tierId}" was not found.`, 'NOT_FOUND');
      }
      if (tier.available + booking.quantity > tier.capacity) {
        throw new DomainError('Cancelling would exceed the ticket tier capacity.', 'INVARIANT');
      }

      tier.available += booking.quantity;
      tier.sold -= booking.quantity;
      booking.status = 'cancelled';
      await repository.saveTier(tier);
      await repository.saveBooking(booking);
      return booking;
    },
  };
}
