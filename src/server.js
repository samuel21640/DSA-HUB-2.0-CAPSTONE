import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { createApp } from './http/app.js';
import { createRouter } from './http/router.js';
import { registerApiRoutes } from './http/apiRoutes.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';
import { createSqliteRepository } from './repositories/sqlite.js';
import { createBookingService } from './services/bookingService.js';
import { createEventService } from './services/eventService.js';

export function createServerApp({
  repository = createSqliteRepository(),
  paymentGateway = createMockPaymentGateway(),
} = {}) {
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, paymentGateway);
  const router = registerApiRoutes(createRouter(), { eventService, bookingService });
  return createApp({ router });
}

export function startServer({ port = config.port, app = createServerApp() } = {}) {
  const server = createServer(app);
  server.listen(port, () => {
    console.log(`Event Ticketing server listening on port ${server.address().port}.`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
