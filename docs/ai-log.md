## Build 1
- **What I asked:** I asked the co-pilot to implement the build 1 domain core
- **What came back:** It built the src\domain file and scripts file
- **What was wrong (or "nothing"):** Nothing was wrong

## Build 3
- **What I asked:** I asked the co-pilot to add the architecture diagrams, booking state machine, Node.js HTTP server, port configuration, and tests.
- **What came back:** It added the requested layered design, state transition data, router and static-file server, `/health` endpoint, start script, and Build 3 tests.
- **What was wrong (or "nothing"):** The first state lookup could read inherited object properties for an unknown state name. I changed it to accept only declared own state keys and added a regression test; all tests pass.
