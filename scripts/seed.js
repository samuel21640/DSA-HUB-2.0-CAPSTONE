import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';

const database = openDatabase();
const repository = createSqliteRepository(database);

try {
  const eventCount = database.prepare('SELECT COUNT(*) AS count FROM events').get().count;
  if (eventCount > 0) {
    console.log('Database already contains events; seed data was not added.');
  } else {
    database.exec('BEGIN IMMEDIATE');
    try {
      const organizerId = 'seed-organizer';
      database.prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)').run(
        organizerId,
        'Event Organizer',
        'organizer@example.test',
      );
      const eventService = createEventService(repository);
      const event = await eventService.createEvent(organizerId, {
        title: 'Lagos Summer Sounds',
        city: 'Lagos',
        venue: 'City Arena',
        date: '2027-07-18T17:00:00.000Z',
      });
      await eventService.addTier(organizerId, event.id, {
        name: 'General admission',
        priceCents: 2500,
        capacity: 100,
      });
      await eventService.publishEvent(organizerId, event.id);
      database.exec('COMMIT');
      console.log(`Seeded ${event.title} with 100 general admission tickets.`);
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
} finally {
  repository.close();
}
