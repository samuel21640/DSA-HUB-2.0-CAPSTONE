import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertTransition, BOOKING_STATES, BOOKING_TRANSITIONS, canTransition } from '../src/domain/bookingStateMachine.js';
import { DomainError } from '../src/domain/errors.js';
import { createConfig } from '../src/config.js';
import { createApp } from '../src/http/app.js';
import { createRouter } from '../src/http/router.js';
import { createServerApp, startServer } from '../src/server.js';
import { createMemoryRepository } from '../src/repositories/memory.js';

test('configuration defaults to port 3000 and validates PORT', () => {
  assert.deepEqual(createConfig({}), { port: 3000 });
  assert.deepEqual(createConfig({ PORT: '8080' }), { port: 8080 });
  assert.throws(() => createConfig({ PORT: 'not-a-port' }), /PORT must be/);
});

test('booking state machine permits every declared move', () => {
  for (const [from, destinations] of Object.entries(BOOKING_TRANSITIONS)) {
    for (const to of destinations) {
      assert.equal(canTransition(from, to), true, `${from} should transition to ${to}`);
      assert.doesNotThrow(() => assertTransition(from, to));
    }
  }
});

test('booking state machine rejects every other state pair with INVALID_TRANSITION', () => {
  for (const from of BOOKING_STATES) {
    for (const to of BOOKING_STATES) {
      if (BOOKING_TRANSITIONS[from].includes(to)) {
        continue;
      }
      assert.equal(canTransition(from, to), false, `${from} should not transition to ${to}`);
      assert.throws(
        () => assertTransition(from, to),
        (error) => error instanceof DomainError && error.code === 'INVALID_TRANSITION',
      );
    }
  }
  assert.equal(canTransition('unknown', 'paid'), false);
  assert.equal(canTransition('toString', 'paid'), false);
  assert.throws(
    () => assertTransition('toString', 'paid'),
    (error) => error instanceof DomainError && error.code === 'INVALID_TRANSITION',
  );
});

test('router matches methods, static paths, and decoded path parameters', () => {
  const handler = () => 'matched';
  const router = createRouter().get('/events/:eventId/bookings/:bookingId', handler);

  assert.deepEqual(router.match('GET', '/events/event%201/bookings/booking-2'), {
    handler,
    params: { eventId: 'event 1', bookingId: 'booking-2' },
  });
  assert.equal(router.match('POST', '/events/event%201/bookings/booking-2'), null);
  assert.equal(router.match('GET', '/events/event%201'), null);
});

test('HTTP server answers a real GET /health request', async (t) => {
  const server = startServer({
    port: 0,
    app: createServerApp({ repository: createMemoryRepository() }),
  });
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('HTTP server returns consistent JSON errors for malformed JSON and unknown API paths', async (t) => {
  const server = createServer(createApp());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const badJson = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"booking":',
  });
  assert.equal(badJson.status, 400);
  assert.deepEqual(await badJson.json(), {
    error: { code: 'BAD_JSON', message: 'Request body must contain valid JSON.' },
  });

  const missingRoute = await fetch(`${baseUrl}/api/missing`);
  assert.equal(missingRoute.status, 404);
  assert.deepEqual(await missingRoute.json(), {
    error: { code: 'NOT_FOUND', message: 'API route not found.' },
  });
});

test('static file serving stays within publicDir', async (t) => {
  const publicDir = await mkdtemp(path.join(os.tmpdir(), 'event-ticketing-public-'));
  const outsideFile = `${publicDir}-outside.txt`;
  await mkdir(path.join(publicDir, 'nested'));
  await writeFile(path.join(publicDir, 'index.html'), '<h1>Public</h1>');
  await writeFile(path.join(publicDir, 'nested', 'hello.txt'), 'hello');
  await writeFile(outsideFile, 'private');
  t.after(async () => {
    await rm(publicDir, { recursive: true, force: true });
    await rm(outsideFile, { force: true });
  });

  const server = createServer(createApp({ publicDir }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const index = await fetch(baseUrl);
  assert.equal(index.status, 200);
  assert.equal(await index.text(), '<h1>Public</h1>');

  const file = await fetch(`${baseUrl}/nested/hello.txt`);
  assert.equal(file.status, 200);
  assert.equal(await file.text(), 'hello');

  const traversal = await fetch(`${baseUrl}/..%2F${path.basename(outsideFile)}`);
  assert.equal(traversal.status, 404);
  assert.equal(await traversal.text(), JSON.stringify({
    error: { code: 'NOT_FOUND', message: 'Resource not found.' },
  }));
});
