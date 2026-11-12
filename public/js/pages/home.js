import { listEvents } from '../api.js';
import { el, formatEventDate, formatPrice } from '../ui.js';

const eventsContainer = document.querySelector('#events');
const filterForm = document.querySelector('#filters');
const citySelect = document.querySelector('#city');
const statusMessage = document.querySelector('#status');
const resultCount = document.querySelector('#result-count');

function showStatus(message, kind = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `notice notice-${kind}`;
  statusMessage.hidden = message === '';
}

function makeEventCard(event) {
  const cheapest = Math.min(...event.tiers.map((tier) => tier.priceCents));
  const availableSeats = event.tiers.reduce((sum, tier) => sum + tier.available, 0);
  return el('article', { className: 'event-card' }, [
    el('div', { className: 'event-card-top' }, [
      el('span', { className: 'event-city' }, event.city),
      el('span', { className: 'event-date' }, formatEventDate(event.date)),
    ]),
    el('div', { className: 'event-card-body' }, [
      el('h3', {}, event.title),
      el('p', { className: 'event-venue' }, event.venue),
      el('div', { className: 'event-card-bottom' }, [
        el('p', { className: 'event-price' }, [
          el('span', { className: 'muted-label' }, 'Tickets from'),
          el('strong', {}, formatPrice(cheapest)),
        ]),
        el('p', { className: 'availability' }, `${availableSeats} ${availableSeats === 1 ? 'seat' : 'seats'} left`),
      ]),
      el('a', {
        className: 'button button-outline card-link',
        href: `./event.html?id=${encodeURIComponent(event.id)}`,
      }, 'View event'),
    ]),
  ]);
}

function updateCityOptions(events) {
  const selectedCity = citySelect.value;
  const cities = [...new Set(events.map((event) => event.city))]
    .sort((left, right) => left.localeCompare(right));
  citySelect.replaceChildren(el('option', { value: '' }, 'All cities'));
  for (const city of cities) {
    citySelect.append(el('option', { value: city }, city));
  }
  citySelect.value = cities.includes(selectedCity) ? selectedCity : '';
}

function readCriteria() {
  const formData = new FormData(filterForm);
  const criteria = { sortBy: formData.get('sortBy') };
  const q = String(formData.get('q') ?? '').trim();
  const city = String(formData.get('city') ?? '');
  const maxPrice = String(formData.get('maxPrice') ?? '').trim();
  if (q) criteria.q = q;
  if (city) criteria.city = city;
  if (maxPrice) {
    const amount = /^(\d+)(?:\.(\d{1,2}))?$/.exec(maxPrice);
    if (!amount) {
      throw new Error('Enter a maximum price with no more than two decimal places.');
    }
    const cents = Number(amount[1]) * 100 + Number((amount[2] ?? '').padEnd(2, '0'));
    if (!Number.isSafeInteger(cents)) {
      throw new Error('Maximum price is too large.');
    }
    criteria.maxPriceCents = cents;
  }
  return criteria;
}

async function loadEvents(criteria = {}) {
  showStatus('');
  eventsContainer.replaceChildren();
  try {
    const allEvents = await listEvents({ sortBy: criteria.sortBy ?? 'date' });
    updateCityOptions(allEvents);
    const events = await listEvents(criteria);
    resultCount.textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
    if (events.length === 0) {
      eventsContainer.append(el('p', { className: 'empty-state' }, 'No events match those filters. Try changing your search.'));
      return;
    }
    eventsContainer.replaceChildren(...events.map(makeEventCard));
  } catch (error) {
    showStatus(error.message || 'Events could not be loaded. Please try again.', 'error');
    resultCount.textContent = '';
  }
}

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    loadEvents(readCriteria());
  } catch (error) {
    showStatus(error.message, 'error');
  }
});

loadEvents();
