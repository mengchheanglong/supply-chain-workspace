# BRIEFING — 2026-10-09T11:10:00Z

## Mission
Investigate and design implementation strategies for Milestone M1 (P0-04 Simulation Determinism): Race-Free Dispatch Queue, Stable EDF sorting, Monotonic Event Sequencing, Canonical Event Sequence Hashing, and GET /api/simulation/events/hash endpoint.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: c:\Users\User\study-workspace\supply-chain-workspace\.agents\teamwork\teamwork_preview_explorer_m1_3
- Original parent: 5b66822e-7c42-44f3-a0ec-c1d55d39fe86
- Milestone: Milestone M1 (P0-04 Simulation Determinism)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- In engine.ts, eliminate blind shift(), dequeue specifically assigned order.id, handle unshift during async routing without dropping orders
- Stable EDF sorting: Add strict tie-breaking to sortDispatchQueueByEDF() (SLA -> priority rank -> creation seq -> order ID)
- Monotonic Event Sequencing: Add incremental sequenceNumber to all domain events in EventBus and SimulationEngine
- Canonical Event Hashing: Implement canonical serialization (sorted JSON keys, excluded volatile wall-clock fields) and compute SHA-256 digest over the ordered event sequence
- API: Add GET /api/simulation/events/hash endpoint returning { hash, eventCount, simulationId }

## Current Parent
- Conversation ID: 5b66822e-7c42-44f3-a0ec-c1d55d39fe86
- Updated: 2026-10-09T11:10:00Z

## Investigation State
- **Explored paths**:
  - `backend/src/simulation/engine.ts` (lines 342, 402, 528-536, 584-740, 1042-1059, 1203, 1607, 1832)
  - `backend/src/events/event-bus.ts` (lines 1-30)
  - `backend/src/world/types.ts` (lines 68-87, 105-115)
  - `backend/src/world/world.ts` (lines 156-230)
  - `backend/src/dispatch/dispatcher.ts` (lines 25-72)
  - `backend/src/routing/client.ts` (lines 51-112)
  - `backend/src/api/routes.ts` (lines 1-100, 400-445)
  - `backend/src/index.ts` (lines 1-36)
  - `backend/tests/simulation.test.ts`, `backend/tests/reroute.test.ts`
  - Peer agent dispatches: `teamwork_preview_explorer_m1_1`, `teamwork_preview_explorer_m1_2`
- **Key findings**:
  - Single-order dispatch at `engine.ts:732` executes blind `this.dispatchQueue.shift()`. While async routing runs, any concurrent `unshift()` (e.g. `ingestEcommerceOrder:402`, `mitigateSlaBreachRisk:1203`, `injectCustomOrder:1832`) puts a newly arrived order at index 0, which gets dropped upon resolution, while the assigned order stays stranded in the queue.
  - `sortDispatchQueueByEDF()` at `engine.ts:528-536` returns `deadlineA - deadlineB`, returning `0` on equal deadlines with zero tie-breaking. A 4-tier comparator (SLA deadline -> priority rank -> creation seq -> order ID) guarantees stable, platform-independent ordering.
  - `SimulationEvent` lacks `sequenceNumber`. Domain events pass through `engine.emitEvent()` (`engine.ts:1042-1059`) and `eventBus.emit()` (`event-bus.ts:12`). Adding monotonic sequence counter to both guarantees gapless ordering.
  - Canonical event serialization requires recursive object key sorting, normalized numbers, and explicit exclusion of volatile fields (`realTimestamp`, `queryTimeMs`, `query_time_ms`, etc.). SHA-256 digest over newline-delimited canonical event strings yields deterministic digest across identical runs.
  - Adding `GET /api/simulation/events/hash` via `engine.getEventSequenceHash()` cleanly maps to `{ hash, eventCount, simulationId }`.
- **Unexplored areas**:
  - None within M1-3 scope. Sibling agents cover clock stepping (m1_1) and PRNG reseeding/unseeded randomness (m1_2).

## Key Decisions Made
- Dequeue by specific order ID via `this.dequeueOrder(order.id)` rather than blind `shift()`.
- Tiered EDF tie-breaker: `deadlineA - deadlineB` -> `rankA - rankB` (`urgent: 0`, `express: 1`, `standard: 2`) -> `seqA - seqB` (`creationSeq` / `createdAt`) -> `idA.localeCompare(idB)`.
- Incremental 1-indexed `sequenceNumber` assigned at `engine.emitEvent()`, with fallback counter in `EventBus.emit()`.
- Dedicated `canonical-hash.ts` utility module implementing key sorting, volatile key exclusion, and SHA-256 calculation.
- Normalizing simulation entityId in canonicalizer when `entityType === 'simulation'` to insulate replay hashes against non-pinned simulation IDs.

## Artifact Index
- `DISPATCH.md` — Original task dispatch
- `BRIEFING.md` — Persistent agent state and index
- `progress.md` — Heartbeat log
- `handoff.md` — Comprehensive exploration & implementation design report
