export function createMockData() {
  return [
    {
      id: 'event-lagos-tech',
      title: 'Lagos Tech Meetup',
      city: 'Lagos',
      venue: 'Landmark Centre',
      date: '2026-12-05T17:00:00.000Z',
      published: true,
      tiers: [
        { id: 'tier-lagos-general', name: 'General admission', priceCents: 250000, capacity: 120, available: 84, sold: 36 },
        { id: 'tier-lagos-vip', name: 'VIP', priceCents: 450000, capacity: 24, available: 0, sold: 24 },
      ],
    },
    {
      id: 'event-abuja-jazz',
      title: 'Abuja Jazz Night',
      city: 'Abuja',
      venue: 'The Dome, Central Park',
      date: '2026-12-12T19:30:00.000Z',
      published: true,
      tiers: [
        { id: 'tier-abuja-general', name: 'General admission', priceCents: 180000, capacity: 90, available: 42, sold: 48 },
        { id: 'tier-abuja-table', name: 'Table for two', priceCents: 600000, capacity: 12, available: 3, sold: 9 },
      ],
    },
    {
      id: 'event-ibadan-food',
      title: 'Ibadan Street Food Fest',
      city: 'Ibadan',
      venue: 'Agodi Gardens',
      date: '2027-01-09T12:00:00.000Z',
      published: true,
      tiers: [
        { id: 'tier-ibadan-entry', name: 'Festival pass', priceCents: 75000, capacity: 250, available: 197, sold: 53 },
      ],
    },
    {
      id: 'event-port-harcourt-art',
      title: 'Art After Hours',
      city: 'Port Harcourt',
      venue: 'Rivers State Cultural Centre',
      date: '2027-01-16T18:00:00.000Z',
      published: true,
      tiers: [
        { id: 'tier-ph-general', name: 'General admission', priceCents: 125000, capacity: 80, available: 56, sold: 24 },
      ],
    },
    {
      id: 'event-kano-design',
      title: 'Northern Design Conference',
      city: 'Kano',
      venue: 'Bayero University Auditorium',
      date: '2027-02-06T09:00:00.000Z',
      published: true,
      tiers: [
        { id: 'tier-kano-standard', name: 'Standard', priceCents: 300000, capacity: 150, available: 109, sold: 41 },
        { id: 'tier-kano-student', name: 'Student', priceCents: 100000, capacity: 60, available: 32, sold: 28 },
      ],
    },
  ];
}
