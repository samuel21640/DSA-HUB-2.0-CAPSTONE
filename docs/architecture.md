# Build 3 architecture

## Layers

```mermaid
flowchart TD
  Routes[HTTP routes] --> Services[Application services]
  Services --> Rules[Domain rules]
  Services --> Repositories[Repositories]
  Repositories --> Database[(Database)]
```

- **Routes** may validate HTTP-level input and translate requests and responses; they may not contain business rules or access repositories directly.
- **Services** may coordinate domain rules and repositories; they may not depend on routes or HTTP details.
- **Rules** may enforce business invariants using supplied data; they may not perform I/O or call services, routes, or repositories.
- **Repositories** may load and save data; they may not own business decisions or call services, routes, or domain rules.
- **Database** may persist data; it may not call application layers.

## Data model

```mermaid
erDiagram
  USERS ||--o{ BOOKINGS : makes
  EVENTS ||--|{ TICKET_TIERS : offers
  EVENTS ||--o{ BOOKINGS : receives
  TICKET_TIERS ||--o{ BOOKINGS : reserves

  USERS {
    string id
    string name
    string email
  }
  EVENTS {
    string id
    string title
    string city
    string venue
    datetime date
    boolean published
  }
  TICKET_TIERS {
    string id
    string event_id
    string name
    integer price_cents
    integer capacity
  }
  BOOKINGS {
    string id
    string user_id
    string event_id
    string tier_id
    integer quantity
    integer total_cents
    string status
  }
```

## Booking life cycle

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> paid
  pending --> cancelled
  paid --> checked_in
  paid --> refunded
  paid --> cancelled
  cancelled --> [*]
  refunded --> [*]
  checked_in --> [*]
```
