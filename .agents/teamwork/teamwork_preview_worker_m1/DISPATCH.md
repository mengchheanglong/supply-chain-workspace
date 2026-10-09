## 2026-10-09T11:12:57Z
You are teamwork_preview_worker_m1.
Your working directory is:
c:\Users\User\study-workspace\supply-chain-workspace\.agents\teamwork\teamwork_preview_worker_m1\

Read ORIGINAL_REQUEST.md at:
c:\Users\User\study-workspace\supply-chain-workspace\.agents\teamwork\ORIGINAL_REQUEST.md

Read PROJECT.md at:
c:\Users\User\study-workspace\supply-chain-workspace\.agents\teamwork\orchestrator\PROJECT.md

Read Explorer reports:
1. Clock, Stepping, Pause: c:\Users\User\study-workspace\supply-chain-workspace\.agents\teamwork\teamwork_preview_explorer_m1_1\handoff.md
2. PRNG, Reset, Random Purging: c:\Users\User\study-workspace\supply-chain-workspace\.agents\teamwork\teamwork_preview_explorer_m1_2\handoff.md
3. Queue Race, Event Hashing: c:\Users\User\study-workspace\supply-chain-workspace\.agents\teamwork\teamwork_preview_explorer_m1_3\handoff.md

Scope: Implement Milestone M1: P0-04 — Simulation Determinism, Injected Clock/RNG, Replay, Queue Ordering & Pause/Reset Controls in logistics-sandbox.

Write Ownership:
You exclusively own and may edit the following files:
- logistics-sandbox/backend/src/simulation/clock.ts
- logistics-sandbox/backend/src/simulation/engine.ts
- logistics-sandbox/backend/src/simulation/chaos-engine.ts
- logistics-sandbox/backend/src/world/world.ts
- logistics-sandbox/backend/src/world/types.ts
- logistics-sandbox/backend/src/events/event-bus.ts
- logistics-sandbox/backend/src/events/canonical-hash.ts (new)
- logistics-sandbox/backend/src/api/routes.ts
- logistics-sandbox/backend/src/dispatch/predictive-ai.ts
- logistics-sandbox/backend/src/integrations/ecommerce.ts
- logistics-sandbox/frontend/src/types/index.ts
- logistics-sandbox/backend/tests/*

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Key Tasks to Implement:
1. `SimulationClock`: Add `step(deltaSimMs: number)`, `reset()`, decouple from `Date.now()`, expose public `isPaused`.
2. Strict Pause Freezing: In `advanceVehicle` and `updateVehicles`, check `if (this.clock.isPaused || deltaSimMs <= 0) return;` — strictly freeze vehicle movement, coordinates, progress, trail history, and SLA updates. Ensure `getStatus()` / `getState().status` immediately reports 'paused' when paused. In `tick()`, exit early if paused.
3. Discrete Stepping API: Implement `engine.step(steps, deltaSimMs)` and REST endpoint `POST /api/simulation/step`.
4. PRNG Reseeding on Reset: In `World.reset(config)`, reseed `this.rng = new SeededRandom(config.seed)` and expose `world.getRng()`.
5. Full Engine Reset: Implement `engine.reset()` resetting clock, clearing dispatch queue, event bus history/counter, in-memory persistence stores, chaos engine, and predictive AI. Expose REST endpoint `POST /api/simulation/reset`.
6. Purge All 11 Unseeded Random / Wall-clock usages across engine, chaos, and AI modules.
7. Race-Free Dispatch Queue: Implement `dequeueOrder(orderId)` to eliminate blind `shift()` after async routing. Implement 4-tier EDF sorting comparator with total tie-breaking.
8. Monotonic Event Sequencing: Add `sequenceNumber` to `SimulationEvent`, `EventBus`, and `SimulationEngine`.
9. Canonical Event Hashing: Implement `canonical-hash.ts` with sorted JSON keys, volatile wall-clock field exclusion, and SHA-256 digest over newline-delimited canonical event strings. Expose `GET /api/simulation/events/hash`.
10. Test Suite: Add comprehensive determinism tests in `backend/tests/determinism-p0-04.test.ts`. Run `pnpm test` (all 55 existing tests + new determinism tests must pass) and `pnpm build` in both backend and frontend.

Deliver a detailed handoff report to:
c:\Users\User\study-workspace\supply-chain-workspace\.agents\teamwork\teamwork_preview_worker_m1\handoff.md
Maintain progress.md. When complete, notify the orchestrator via send_message.
