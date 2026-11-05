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

## Build 5
- **What I asked:** I asked the co-pilot to move the repository to SQLite, persist server data, add a one-time seed command, and reproduce the last-ticket overselling race with 50 concurrent booking attempts.
- **What came back:** It added the SQLite schema and repository, switched the server's default repository to SQLite, added seed and oversell scripts, and covered persistence and database constraints with a test.
- **What was wrong (or "nothing"):** The initial API tests assumed each server used an empty in-memory repository. I kept those tests isolated with the memory repository and verified persistence separately. The first demo reproduced overselling: 50 requests succeeded, creating bookings for 99 seats total when only 50 were available. In the follow-up, I moved reservation into one conditional SQLite `UPDATE` and added a 50-request regression test; the demo then showed one success and 49 `SOLD_OUT` results, with 50 seats sold total.
- **Why not a lock variable or a second check:** A JavaScript lock variable only coordinates calls that share that one process and can be bypassed by another server process or direct database writer. A second read/check still has a race between checking capacity and writing it, so only the conditional database update makes checking and reserving one atomic operation.
