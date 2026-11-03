function readPort(value) {
  if (value === undefined) {
    return 3000;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new TypeError('PORT must be a whole number from 0 to 65535.');
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new TypeError('PORT must be a whole number from 0 to 65535.');
  }
  return port;
}

export function createConfig(env = process.env) {
  return Object.freeze({ port: readPort(env.PORT) });
}

export const config = createConfig();
