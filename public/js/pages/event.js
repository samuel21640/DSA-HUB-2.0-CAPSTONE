import { createBooking, getEvent, pay } from '../api.js';
import { el, formatEventDate, formatPrice } from '../ui.js';

const query = new URLSearchParams(window.location.search);
const eventId = query.get('id');
const eventContainer = document.querySelector('#event-details');
const checkout = document.querySelector('#checkout');
const statusMessage = document.querySelector('#status');
let countdownTimer;

function showStatus(message, kind = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `notice notice-${kind}`;
  statusMessage.hidden = message === '';
}

function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function makeTierCard(event, tier, index) {
  const soldOut = tier.available === 0;
  const quantityId = `quantity-${index}`;
  const nameId = `attendee-name-${index}`;
  const form = el('form', {
    className: `tier-card${soldOut ? ' tier-sold-out' : ''}`,
    onSubmit: async (submitEvent) => {
      submitEvent.preventDefault();
      const quantityInput = form.elements.namedItem('quantity');
      const nameInput = form.elements.namedItem('attendeeName');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      showStatus('');
      try {
        const booking = await createBooking({
          eventId: event.id,
          tierId: tier.id,
          attendeeName: nameInput.value,
          quantity: Number(quantityInput.value),
        });
        await renderCheckout(event, tier, booking);
        showStatus('');
        try {
          renderEvent(await getEvent(event.id));
        } catch (error) {
          showStatus(
            `Booking created, but ticket availability could not be refreshed: ${error.message}`,
            'error',
          );
        }
      } catch (error) {
        showStatus(error.error?.message || error.message || 'Tickets could not be reserved.', 'error');
        button.disabled = soldOut;
      }
    },
  }, [
    el('div', { className: 'tier-heading' }, [
      el('div', {}, [
        el('h3', {}, tier.name),
        el('p', { className: 'tier-seats' }, soldOut ? 'Sold out' : `${tier.available} seats remaining`),
      ]),
      el('strong', { className: 'tier-price' }, formatPrice(tier.priceCents)),
    ]),
    el('div', { className: 'tier-controls' }, [
      el('div', { className: 'field' }, [
        el('label', { for: nameId }, 'Attendee name'),
        el('input', {
          id: nameId,
          name: 'attendeeName',
          type: 'text',
          autocomplete: 'name',
          required: true,
          disabled: soldOut,
          placeholder: 'Your name',
        }),
      ]),
      el('div', { className: 'field quantity-field' }, [
        el('label', { for: quantityId }, 'Tickets'),
        el('input', {
          id: quantityId,
          name: 'quantity',
          type: 'number',
          min: '1',
          max: String(Math.min(10, tier.available)),
          value: '1',
          required: true,
          disabled: soldOut,
        }),
      ]),
    ]),
    soldOut
      ? el('button', { className: 'button button-disabled', type: 'button', disabled: true }, 'Sold out')
      : el('button', { className: 'button button-primary tier-submit', type: 'submit' }, 'Reserve tickets'),
  ]);

  return form;
}

function renderEvent(event) {
  const availableTiers = event.tiers.filter((tier) => tier.available > 0);
  const lowestPrice = availableTiers.length > 0
    ? Math.min(...availableTiers.map((tier) => tier.priceCents))
    : null;
  const details = el('div', { className: 'event-detail-layout' }, [
    el('section', { className: 'event-hero', 'aria-labelledby': 'event-title' }, [
      el('p', { className: 'eyebrow' }, `${event.city} · ${formatEventDate(event.date)}`),
      el('h1', { id: 'event-title' }, event.title),
      el('p', { className: 'event-detail-venue' }, event.venue),
      el('div', { className: 'event-facts' }, [
        el('div', {}, [
          el('span', { className: 'muted-label' }, 'Starting at'),
          el('strong', {}, lowestPrice === null ? 'Sold out' : formatPrice(lowestPrice)),
        ]),
        el('div', {}, [
          el('span', { className: 'muted-label' }, 'Ticket options'),
          el('strong', {}, `${event.tiers.length} ${event.tiers.length === 1 ? 'tier' : 'tiers'}`),
        ]),
      ]),
    ]),
    el('section', { className: 'ticket-section', 'aria-labelledby': 'tickets-title' }, [
      el('div', { className: 'section-heading' }, [
        el('div', {}, [
          el('p', { className: 'eyebrow' }, 'Choose your spot'),
          el('h2', { id: 'tickets-title' }, 'Tickets'),
        ]),
      ]),
      el('div', { className: 'tier-list' }, event.tiers.map((tier, index) => makeTierCard(event, tier, index))),
    ]),
  ]);
  eventContainer.replaceChildren(details);
}

function renderCheckout(event, tier, booking) {
  window.clearInterval(countdownTimer);
  checkout.hidden = false;
  const countdown = el('strong', { className: 'countdown', 'aria-live': 'polite' }, '');
  const expirationMessage = el('p', { className: 'hold-message', role: 'status' }, '');
  const paymentMessage = el('p', { className: 'payment-message', role: 'status' }, '');
  const paymentForm = el('form', {
    className: 'payment-form',
    onSubmit: async (submitEvent) => {
      submitEvent.preventDefault();
      const button = paymentForm.querySelector('button[type="submit"]');
      button.disabled = true;
      paymentMessage.textContent = '';
      try {
        const result = await pay(booking.reference, {
          decline: paymentForm.elements.namedItem('cardOutcome').value === 'declined',
        });
        paymentMessage.className = 'payment-message notice-success';
        paymentMessage.textContent = `Payment confirmed. Your booking reference is ${result.reference}.`;
        button.textContent = 'Booking confirmed';
      } catch (error) {
        paymentMessage.className = 'payment-message notice-error';
        paymentMessage.textContent = error.error?.message || error.message || 'Payment failed. Please try again.';
        button.disabled = Date.now() >= Date.parse(booking.holdExpiresAt);
      }
    },
  }, [
    el('div', { className: 'field' }, [
      el('label', { for: 'card-outcome' }, 'Mock card outcome'),
      el('select', { id: 'card-outcome', name: 'cardOutcome' }, [
        el('option', { value: 'approved' }, 'Approved'),
        el('option', { value: 'declined' }, 'Declined'),
      ]),
    ]),
    el('button', { className: 'button button-primary', type: 'submit' }, 'Pay with mock card'),
  ]);

  checkout.replaceChildren(
    el('div', { className: 'checkout-copy' }, [
      el('p', { className: 'eyebrow' }, 'Almost there'),
      el('h2', { id: 'checkout-title' }, 'Complete your booking'),
      el('p', {}, `${booking.attendeeName} · ${booking.quantity} × ${tier.name}`),
      el('p', { className: 'checkout-total' }, [
        el('span', {}, 'Total'),
        el('strong', {}, formatPrice(booking.totalCents)),
      ]),
      el('p', { className: 'hold-message' }, ['Your seats are held for ', countdown]),
      expirationMessage,
      paymentMessage,
    ]),
    paymentForm,
  );
  const expiresAt = Date.parse(booking.holdExpiresAt);
  const updateCountdown = () => {
    const remaining = expiresAt - Date.now();
    countdown.textContent = formatCountdown(remaining);
    if (remaining <= 0) {
      window.clearInterval(countdownTimer);
      expirationMessage.textContent = 'This hold has expired. Choose tickets again to continue.';
      paymentForm.querySelector('button[type="submit"]').disabled = true;
    }
  };
  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 1000);
  checkout.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadEvent() {
  if (!eventId) {
    showStatus('No event was selected. Return to the event list to choose one.', 'error');
    return;
  }
  try {
    const event = await getEvent(eventId);
    renderEvent(event);
  } catch (error) {
    showStatus(error.error?.message || error.message || 'This event could not be loaded.', 'error');
  }
}

loadEvent();
