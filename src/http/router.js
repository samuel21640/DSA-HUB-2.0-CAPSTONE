function splitPath(path) {
  return path.split('/').slice(1);
}

export class Router {
  #routes = [];

  add(method, path, handler) {
    const normalizedMethod = method.toUpperCase();
    if (!path.startsWith('/') || path.includes('?')) {
      throw new TypeError('Route paths must be absolute paths without a query string.');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('A route handler must be a function.');
    }

    const segments = splitPath(path);
    if (segments.some((segment) => segment.startsWith(':') && segment.length === 1)) {
      throw new TypeError('Route parameter names cannot be empty.');
    }
    if (this.#routes.some((route) => route.method === normalizedMethod && route.path === path)) {
      throw new TypeError(`Route ${normalizedMethod} ${path} is already registered.`);
    }

    this.#routes.push({ method: normalizedMethod, path, segments, handler });
    return this;
  }

  get(path, handler) {
    return this.add('GET', path, handler);
  }

  post(path, handler) {
    return this.add('POST', path, handler);
  }

  put(path, handler) {
    return this.add('PUT', path, handler);
  }

  patch(path, handler) {
    return this.add('PATCH', path, handler);
  }

  delete(path, handler) {
    return this.add('DELETE', path, handler);
  }

  match(method, path) {
    const normalizedMethod = method.toUpperCase();
    const requestedSegments = splitPath(path);

    for (const route of this.#routes) {
      if (route.method !== normalizedMethod || route.segments.length !== requestedSegments.length) {
        continue;
      }

      const params = {};
      let matches = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        const routeSegment = route.segments[index];
        const requestedSegment = requestedSegments[index];

        if (routeSegment.startsWith(':')) {
          try {
            params[routeSegment.slice(1)] = decodeURIComponent(requestedSegment);
          } catch {
            matches = false;
            break;
          }
        } else if (routeSegment !== requestedSegment) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return { handler: route.handler, params };
      }
    }

    return null;
  }
}

export function createRouter() {
  return new Router();
}
