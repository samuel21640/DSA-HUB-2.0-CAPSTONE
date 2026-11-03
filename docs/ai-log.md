## Build 1
- **What I asked:** I asked the co-pilot to implement the build 1 domain core
- **What came back:** It built the src\domain file and scripts file
- **What was wrong (or "nothing"):** Nothing was wrong

## Build 3
- **What I asked:** I asked the co-pilot to add the architecture diagrams, booking state machine, Node.js HTTP server, port configuration, and tests.
- **What came back:** It added the requested layered design, state transition data, router and static-file server, `/health` endpoint, start script, and Build 3 tests.
- **What was wrong (or "nothing"):** The first state lookup could read inherited object properties for an unknown state name. I changed it to accept only declared own state keys and added a regression test; all tests pass.

## Build 4
- **What I asked:** I asked the co-pilot to add an in-memory repository, injected services, mock payments, REST routes, API examples, and real-server API tests.
- **What came back:** It added the API and tests for event and tier creation, publication, search, booking, payment, and cancellation.
- **What was wrong (or "nothing"):** The first API test exposed that Build 3's state machine allows `paid` to transition to `cancelled`, while Build 4 permits cancellation only for unpaid bookings. I added a Build 4 service rule requiring `pending` before cancellation. A declined payment stays pending, and the focused API tests and full suite pass.
