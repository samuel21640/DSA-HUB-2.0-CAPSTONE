import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { createApp } from './http/app.js';

export function startServer({ port = config.port, app = createApp() } = {}) {
  const server = createServer(app);
  server.listen(port, () => {
    console.log(`Event Ticketing server listening on port ${server.address().port}.`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
