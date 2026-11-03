import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError } from '../domain/errors.js';
import { createRouter } from './router.js';

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function sendJson(response, statusCode, payload, headers = {}, method = 'GET') {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

async function readJsonBody(request) {
  if (request.headers['content-length'] === '0'
    || (!request.headers['content-length'] && !request.headers['transfer-encoding'])) {
    return undefined;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      request.resume();
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    }
    chunks.push(chunk);
  }

  if (totalBytes === 0) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new HttpError(400, 'BAD_JSON', 'Request body must contain valid JSON.');
    }
    throw error;
  }
}

function isWithinDirectory(directory, file) {
  const relativePath = path.relative(directory, file);
  return relativePath === '' || (!path.isAbsolute(relativePath)
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`));
}

async function resolvePublicFile(publicDir, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decodedPath.includes('\0') || decodedPath.includes('\\')) {
    return null;
  }

  const root = path.resolve(publicDir);
  const requestedPath = decodedPath.replace(/^\/+/, '') || 'index.html';
  let candidate = path.resolve(root, requestedPath);
  if (!isWithinDirectory(root, candidate)) {
    return null;
  }

  try {
    const realRoot = await realpath(root);
    let details = await stat(candidate);
    if (details.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
      details = await stat(candidate);
    }
    if (!details.isFile()) {
      return null;
    }

    const realFile = await realpath(candidate);
    return isWithinDirectory(realRoot, realFile) ? realFile : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES') {
      return null;
    }
    throw error;
  }
}

async function serveStatic(request, response, publicDir, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }

  const file = await resolvePublicFile(publicDir, pathname);
  if (file === null) {
    return false;
  }

  const contentType = CONTENT_TYPES.get(path.extname(file).toLowerCase())
    ?? 'application/octet-stream';
  response.writeHead(200, { 'content-type': contentType });
  if (request.method === 'HEAD') {
    response.end();
    return true;
  }

  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(response);
  });
  return true;
}

function statusForDomainError(error) {
  if (error.code === 'NOT_FOUND') {
    return 404;
  }
  if (error.code === 'FORBIDDEN') {
    return 403;
  }
  return 400;
}

export function createApp({ publicDir = DEFAULT_PUBLIC_DIR, router = createRouter() } = {}) {
  router.get('/health', () => ({ status: 'ok' }));

  return async function app(request, response) {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      const body = await readJsonBody(request);
      const matched = router.match(request.method, requestUrl.pathname);

      if (matched) {
        const result = await matched.handler({
          body,
          params: matched.params,
          request,
          url: requestUrl,
        });
        const output = result && typeof result === 'object' && Object.hasOwn(result, 'body')
          ? result
          : { body: result };
        sendJson(
          response,
          output.statusCode ?? 200,
          output.body,
          output.headers,
          request.method,
        );
        return;
      }

      if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
        sendJson(response, 404, {
          error: { code: 'NOT_FOUND', message: 'API route not found.' },
        }, {}, request.method);
        return;
      }

      if (await serveStatic(request, response, publicDir, requestUrl.pathname)) {
        return;
      }

      sendJson(response, 404, {
        error: { code: 'NOT_FOUND', message: 'Resource not found.' },
      }, {}, request.method);
    } catch (error) {
      if (response.headersSent) {
        console.error(error);
        response.destroy(error);
        return;
      }

      if (error instanceof HttpError) {
        sendJson(response, error.statusCode, {
          error: { code: error.code, message: error.message },
        }, {}, request.method);
        return;
      }
      if (error instanceof DomainError) {
        sendJson(response, statusForDomainError(error), {
          error: { code: error.code, message: error.message },
        }, {}, request.method);
        return;
      }

      console.error(error);
      sendJson(response, 500, {
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
      }, {}, request.method);
    }
  };
}
