# Build 4 API examples

Start the server with `npm start`. The default base URL is `http://localhost:3000`.
Replace `USER_ID`, `EVENT_ID`, `TIER_ID`, and `BOOKING_REFERENCE` with values
from the responses. Send the same `x-user-id` for an event's create, tier, and
publish requests.

## 1. Create an event

```sh
curl -X POST http://localhost:3000/api/events \
  -H "content-type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{"title":"Lagos Tech Meetup","city":"Lagos","venue":"Main Hall","date":"2026-12-05T17:00:00.000Z"}'
```

## 2. Add a ticket tier

```sh
curl -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H "content-type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{"name":"General","priceCents":500000,"capacity":100}'
```

## 3. Publish the event

```sh
curl -X POST http://localhost:3000/api/events/EVENT_ID/publish \
  -H "x-user-id: USER_ID"
```

## 4. Search published events

```sh
curl "http://localhost:3000/api/events?q=meetup&city=lagos&from=2026-12-01&to=2026-12-31&maxPriceCents=500000&onlyAvailable=true&sortBy=price"
```

Supported query parameters are `q`, `city`, `from`, `to`, `maxPriceCents`,
`onlyAvailable`, and `sortBy` (`date`, `price`, or `availability`).

## 5. Book tickets

```sh
curl -X POST http://localhost:3000/api/bookings \
  -H "content-type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{"eventId":"EVENT_ID","tierId":"TIER_ID","attendeeName":"Ada","quantity":2}'
```

## 6. Pay for a booking

The mock gateway succeeds by default and does not receive card details.

```sh
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay \
  -H "content-type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{}'
```

To exercise a decline, request it explicitly. The booking stays pending.

```sh
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay \
  -H "content-type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{"decline":true}'
```

## 7. Cancel an unpaid booking

```sh
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/cancel \
  -H "x-user-id: USER_ID"
```
