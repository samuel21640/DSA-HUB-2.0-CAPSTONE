import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DATABASE_PATH = fileURLToPath(new URL('../../data/event-ticketing.sqlite', import.meta.url));
const SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));
const SCHEMA = readFileSync(SCHEMA_PATH, 'utf8');

export function openDatabase({ filename = DATABASE_PATH } = {}) {
  if (filename !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const database = new DatabaseSync(filename);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(SCHEMA);
  return database;
}
