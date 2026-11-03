import { DomainError } from '../domain/errors.js';

function requireUserId(request) {
  const userId = request.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new DomainError('The x-user-id header is required.', 'UNAUTHENTICATED');
  }
  return userId.trim();
}

export function registerApiRoutes(router, { eventService, bookingService }) {
  router.post('/api/events', async ({ body, request }) => ({
    statusCode: 201,
    body: await eventService.createEvent(requireUserId(request), body),
  }));
  router.post('/api/events/:id/tiers', async ({ body, params, request }) => ({
    statusCode: 201,
    body: await eventService.addTier(requireUserId(request), params.id, body),
  }));
  router.post('/api/events/:id/publish', async ({ params, request }) => ({
    body: await eventService.publishEvent(requireUserId(request), params.id),
  }));
  router.get('/api/events', async ({ url }) => ({
    body: await eventService.searchEvents(Object.fromEntries(url.searchParams)),
  }));
  router.post('/api/bookings', async ({ body, request }) => ({
    statusCode: 201,
    body: await bookingService.createBooking(requireUserId(request), body),
  }));
  router.post('/api/bookings/:reference/pay', async ({ body, params, request }) => ({
    body: await bookingService.payBooking(
      requireUserId(request),
      params.reference,
      body ?? {},
    ),
  }));
  router.post('/api/bookings/:reference/cancel', async ({ params, request }) => ({
    body: await bookingService.cancelBooking(
      requireUserId(request),
      params.reference,
    ),
  }));
  return router;
}
