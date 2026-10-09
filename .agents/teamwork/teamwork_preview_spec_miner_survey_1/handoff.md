# Handoff Report: P0-04 Simulation Determinism, Injected Clock/RNG, Replay, and Dispatch Ordering

**Agent**: `teamwork_preview_spec_miner_survey_1`  
**Milestone**: P0-04 Survey & Specification Mining (`logistics-sandbox`)  
**Timestamp**: 2026-10-09T11:00:00Z  

---

## 1. Observation

Direct code inspections, tool commands, and test executions within `logistics-sandbox/` and workspace documentation revealed the following exact facts:

### 1.1 Baseline Test & Build Status
- Running `pnpm test` in `logistics-sandbox/backend`:
  - **10 test files passed (10)**: `egress-isolation.test.ts`, `neo4j-relationships.test.ts`, `persistence.test.ts`, `phase4-predictive-ai.test.ts`, `reroute.test.ts`, `resilience-and-chaos.test.ts`, `simulation.test.ts`, `telemetry.test.ts`, `vrp.test.ts`, `vrptw-scenarios.test.ts`.
  - **55 tests passed (55)** total in 8.53s.
- Running `pnpm build` (`tsc`) in `logistics-sandbox/backend`: Exited with code 0 (clean compilation).
- Running `pnpm build` (`tsc && vite build`) in `logistics-sandbox/frontend`: Exited with code 0 (clean compilation).

### 1.2 Clock & Time Progression Implementation
- In `backend/src/simulation/clock.ts`:
  - Line 26: `this.realTimeStart = Date.now();`
  - Line 28: `this.lastRealTime = this.realTimeStart;`
  - Lines 35–40:
    ```typescript
    public tick(deltaRealMs: number): void {
      if (this.isPaused || this.speed === 0) return;
      const deltaSimMs = deltaRealMs * this.speed * this.SIM_TIME_RATIO;
      this.currentTime += deltaSimMs;
      this.lastRealTime += deltaRealMs;
    }
    ```
  - Ratio is hardcoded: `SIM_TIME_RATIO = 60` (1 real second = 60 simulated seconds at 1x speed).
  - No manual step API (`step(simDeltaMs)`) exists.
- In `backend/src/simulation/engine.ts`:
  - Lines 278–279:
    ```typescript
    this.lastTickTime = Date.now();
    this.intervalId = setInterval(() => this.tick(), this.TICK_RATE_MS);
    ```
  - Lines 324–332:
    ```typescript
    private tick(): void {
      const now = Date.now();
      const deltaMs = now - this.lastTickTime;
      this.lastTickTime = now;
      this.tickCounter++;
      this.clock.tick(deltaMs);
      const simTime = this.clock.getSimulatedTime();
    ```
  - Real tick interval depends entirely on OS scheduling jitter and system wall clock (`Date.now()`).

### 1.3 Pause Implementation Flaws
- In `backend/src/simulation/clock.ts`:
  - Lines 46–48: `pause(): void { this.isPaused = true; }`
  - `this.speed` is NOT modified when `pause()` is called (it remains 1).
- In `backend/src/simulation/engine.ts`:
  - Line 346: Inside `tick()`, `this.updateVehicles(simTime, deltaMs);` is called unconditionally every tick.
  - Lines 828–835 in `advanceVehicle(vehicle: Vehicle, deltaRealMs: number)`:
    ```typescript
    const deltaSimMs = deltaRealMs * this.clock.speed * 60;
    const deltaSimS = deltaSimMs / 1000;
    const effectiveSpeedFactor = 1 / Math.max(0.2, this.trafficMultiplier);
    const progressIncrement = (deltaSimS / vehicle.routeDurationS) * effectiveSpeedFactor;
    vehicle.routeProgress = Math.min(1, vehicle.routeProgress + progressIncrement);
    ```
    **Critical Flaw**: Even when `this.clock.isPaused` is true, `this.clock.speed` is still 1. Therefore, `deltaSimMs` is positive, and vehicles continue moving along routes, advancing coordinates, and completing deliveries while the simulation clock is paused!
  - Lines 1122–1126 in `getState()`:
    ```typescript
    status: this.intervalId
      ? this.clock.speed > 0
        ? 'running'
        : 'paused'
      : 'stopped',
    ```
    **Critical Flaw**: Because `this.clock.speed` is still > 0 when paused, `getState().status` reports `'running'` even after `pause()` was called!
  - In `tick()`, SLA monitoring, chaos ticks (`this.chaosEngine.tick`), and predictive rebalancing are not guarded by pause state.

### 1.4 Reset Implementation Flaws
- In `backend/src/world/world.ts`:
  - Lines 322–332:
    ```typescript
    public reset(config: ScenarioConfig): void {
      this.config = config;
      this.vehicles.clear();
      this.orders.clear();
      this.warehouses.clear();
      this.drivers.clear();
      this.customers.clear();
      this.orderCounter = 0;
      this.customerCounter = 0;
      this.initializeFromConfig(config);
    }
    ```
    **Critical Flaw**: `this.rng` is NOT re-seeded! In constructor line 50: `this.rng = new SeededRandom(config.seed)`. In `reset()`, `this.rng` retains mutated state from prior run. Repeated resets produce completely different pseudo-random sequences (different vehicle starting offset positions, order coordinates, priority rolls, and item counts).
- In `backend/src/simulation/engine.ts`:
  - There is NO `public reset()` method on `SimulationEngine`. Only `loadScenario(scenarioId)`.
  - In `loadScenario()` (lines 464–523):
    - `this.eventBus` history is NOT cleared; previous events accumulate.
    - `this.persistence` in-memory repositories (orders, telemetry pings, graph relationships, vehicle states) are NOT cleared.
    - `this.chaosEngine` active events and metrics are NOT reset.
    - `this.predictiveAiEngine` recent rebalances and metrics are NOT reset.
    - `this.simulationId` is NOT reset.
  - In `backend/src/api/routes.ts`: There is NO `POST /api/simulation/reset` endpoint.

### 1.5 Unseeded Randomness & Wall-Clock Usages (Exact File & Line Numbers)
1. `backend/src/simulation/engine.ts:450`:
   `nextFloat: (min, max) => min + Math.random() * (max - min)` in `resolveDeliveryLocation()` address fallback.
2. `backend/src/simulation/engine.ts:1303`:
   `const id = \`INC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}\`;` in `createRoadIncident()`.
3. `backend/src/simulation/chaos-engine.ts:136`:
   `const template = PHNOM_PENH_CHAOS_TEMPLATES[Math.floor(Math.random() * PHNOM_PENH_CHAOS_TEMPLATES.length)];`
4. `backend/src/simulation/chaos-engine.ts:137`:
   `const eventId = \`CHAOS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}\`;`
5. `backend/src/simulation/chaos-engine.ts:163-164`:
   `enRouteVehicles[Math.floor(Math.random() * enRouteVehicles.length)]` and `allVehicles[Math.floor(Math.random() * allVehicles.length)]`.
6. `backend/src/simulation/chaos-engine.ts:181`:
   `lat: 11.5850 + (Math.random() - 0.5) * 0.02, lon: 104.8820 + (Math.random() - 0.5) * 0.02`.
7. `backend/src/integrations/ecommerce.ts:188`:
   `p.product_id || \`P${Math.floor(1000 + Math.random() * 9000)}\``.
8. `backend/src/simulation/engine.ts:1049`:
   `eventId: uuidv4()` in `emitEvent()`.
9. `backend/src/simulation/engine.ts:1052`:
   `realTimestamp: Date.now()` in `emitEvent()`.
10. `backend/src/simulation/engine.ts:183`:
    `this.simulationId = uuidv4()`.
11. `backend/src/dispatch/predictive-ai.ts:321`:
    `const actionId = \`REBAL-${uuidv4().substring(0, 8).toUpperCase()}\`;`.

### 1.6 Asynchronous Dispatch Queue Race Condition
- In `backend/src/simulation/engine.ts`:
  - Lines 667–674:
    ```typescript
    const orderId = this.dispatchQueue[0];
    const order = this.world.getOrder(orderId);
    if (!order || order.status !== 'pending') {
      this.dispatchQueue.shift();
      this.dispatching = false;
      return;
    }
    ```
  - Lines 676–684:
    ```typescript
    this.dispatcher.assignOrder(order, idleVehicles, this.routingClient, ...)
      .then((result: AssignmentResult | null) => {
        if (result) {
          ...
          this.dispatchQueue.shift();
        }
        this.dispatching = false;
      })
    ```
  - Lines 402, 1203, 1832:
    - Line 402 (`ingestEcommerceOrder`): `this.dispatchQueue.unshift(order.id);`
    - Line 1203 (`mitigateSlaBreachRisk`): `this.dispatchQueue.unshift(order.id);`
    - Line 1832 (`injectCustomOrder`): `this.dispatchQueue.unshift(order.id);`
  - **Race Observation**: While `assignOrder` is waiting on async network routing (`calculateRoute`), incoming orders call `unshift()`. When `assignOrder` resolves, line 732 calls `this.dispatchQueue.shift()`, popping the newly arrived order from index 0 instead of the order that was actually assigned. The newly arrived order is lost/stranded.
  - In `sortDispatchQueueByEDF()` (lines 528–536):
    ```typescript
    this.dispatchQueue.sort((idA, idB) => {
      const orderA = this.world.getOrder(idA);
      const orderB = this.world.getOrder(idB);
      const deadlineA = orderA?.slaDeadline ?? Infinity;
      const deadlineB = orderB?.slaDeadline ?? Infinity;
      return deadlineA - deadlineB;
    });
    ```
    When `deadlineA === deadlineB`, return value is `0` with no tie-breaking, causing unstable ordering across runs.

### 1.7 Canonical Event Hashing & Replay Status
- In `backend/src/events/event-bus.ts`:
  - Only contains an unbounded array `history: SimulationEvent[]`.
  - No sequence numbers, no canonical stringification, no SHA-256 hash calculation, and no replay mechanism exist.

---

## 2. Logic Chain

1. **Determinism requires decoupled, injected time**:
   - Observations 1.2 show that `tick()` measures `deltaMs = Date.now() - this.lastTickTime` from system clock and passes it to `clock.tick()`.
   - OS scheduling jitter introduces variable `deltaMs` on every run (e.g., 98ms vs 103ms).
   - Because `clock.currentTime += deltaMs * speed * 60`, identical inputs produce divergent simulation timestamps for events across repeat runs.
   - Decoupling requires `SimulationClock` and `SimulationEngine` to support fixed discrete tick stepping (`step(deltaSimMs)`), eliminating wall-clock dependencies during simulation runs.

2. **Pause must strictly halt all world state mutations**:
   - Observations 1.3 prove that `advanceVehicle` computes progress using `clock.speed` (which remains 1 during pause), rather than checking pause state or simulated time delta.
   - Vehicles physically move, traverse polylines, and trigger deliveries while paused.
   - To satisfy the acceptance criteria ("pausing must freeze all movement and vehicle updates"), all movement logic, order generation, chaos ticks, and SLA evaluations must be gated by `isPaused`. When paused, simulation delta is 0 and no entity state can change.

3. **Reset must completely restore initial state including RNG**:
   - Observations 1.4 show that `world.reset(config)` clears entities but does NOT reseed `this.rng = new SeededRandom(config.seed)`.
   - Running a scenario, calling reset, and running again results in divergent coordinates, items, and priorities on the second run because the PRNG state was not reset.
   - Furthermore, `EventBus` history and `persistence` repositories accumulate records across resets, leaving orphaned data.
   - A complete reset requires reseeding RNGs, re-initializing entities, resetting clock to 0, clearing dispatch queue, and clearing in-memory persistence and event histories.

4. **Eliminating unseeded randomness is mandatory for replay reproducibility**:
   - Observations 1.5 document 11 locations where `Math.random()`, `Date.now()`, and `uuidv4()` are used.
   - Any single call to `Math.random()` or `uuidv4()` produces different values between two runs, altering incident positions, event IDs, and delivery targets.
   - All randomness must flow through `SeededRandom`, and IDs must be deterministic (e.g. sequence-based or derived from seed and step).

5. **Dispatch queue processing must be race-free and deterministic**:
   - Observations 1.6 prove that `unshift()` during async `assignOrder` causes line 732 `shift()` to discard newly arrived orders.
   - Dequeuing must be atomic (either dequeue at start of dispatch or delete specifically by `order.id`), and queue sorting must feature deterministic tie-breaking (SLA -> priority -> creation seq -> order ID).

6. **Canonical event hashing proves replay fidelity**:
   - Observations 1.7 show no hashing or replay verification exists.
   - By assigning monotonic sequence numbers to domain events, normalizing payloads via sorted-key JSON, and computing SHA-256 over the canonical event sequence, two identical runs from the same seed will produce identical cryptographic digests.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Clock | `SimulationClock.step(deltaSimMs)` | Discrete deterministic time advancement | `deltaSimMs: number` | `currentTime: number` | Ignores/no-op if negative or paused | Code inspection of `clock.ts` |
| 2 | Clock | Injected Clock Interface | Decouples simulation time from system wall-clock `Date.now()` | Start epoch/time, speed multiplier | Current simulated time, ISO string | Rejects invalid speeds (< 0) | `clock.ts:23-29` |
| 3 | Controls | Simulation Pause Control | Halts all vehicle movement, tick progression, SLA updates, and dispatching | None (`pause()`) | `status: 'paused'`, frozen coordinates | Idempotent if already paused | `engine.ts:302`, `clock.ts:46` |
| 4 | Controls | Simulation Resume Control | Resumes movement and clock progression from exact frozen state | None (`resume()`) | `status: 'running'` | Idempotent if already running | `engine.ts:307`, `clock.ts:50` |
| 5 | Controls | Simulation Speed Adjustment | Configures simulation multiplier (1x, 10x, 60x, 600x) | `speed: number` | Updated speed | Rejects non-numbers / negative speeds with HTTP 400 | `routes.ts:30-38` |
| 6 | Controls | Simulation Full Reset | Completely restores simulator to clean zero-state without orphaned deliveries/vehicles | Optional `ScenarioConfig` | Reset state, re-seeded RNG, cleared persistence | Stops running loops before reset | `engine.ts:474`, `world.ts:322` |
| 7 | RNG | Seeded PRNG (`SeededRandom`) | Mulberry32 deterministic random number generator | `seed: number` | Uniform floats [0,1), ints, pick, shuffle | Requires integer seed | `utils/random.ts:5-42` |
| 8 | RNG | Reset PRNG Reseeding | Reseeds PRNG to initial scenario seed upon simulation reset | Scenario `seed` | Re-initialized generator state | None | `world.ts:50,322` |
| 9 | RNG | Deterministic Fallback Geocoding | Resolves coordinates deterministically using seeded RNG instead of Math.random() | Bounds, Seeded RNG | `Coordinate { lat, lon }` | Clamps within scenario bounds | `engine.ts:449-451` |
| 10 | RNG | Deterministic Incident IDs | Generates stable incident IDs from simulation time and sequence/seed | Sim time, counter | `id: string` (e.g. `INC-0001-42`) | Deterministic format | `engine.ts:1303` |
| 11 | Chaos | Seeded Urban Chaos Engine | Injects Phnom Penh urban disruptions using seeded RNG rather than Math.random() | Sim time, Seeded RNG | Scheduled chaos incident event | Disabled in mode 'off' | `chaos-engine.ts:135-200` |
| 12 | Dispatch | Deterministic Dispatch Queue Sorting | Sorts pending orders by EDF with strict multi-key tie breaking | `dispatchQueue: string[]` | Deterministically ordered IDs | Returns stable order even on identical SLAs | `engine.ts:528-536` |
| 13 | Dispatch | Race-Free Dispatch Dequeuing | Dequeues specific order ID upon dispatch without dropping unshifted orders | `orderId: string` | Removed specific queue entry | Returns order to queue if routing fails | `engine.ts:668-735` |
| 14 | Events | Monotonic Event Sequencing | Assigns incremental sequence number to every domain event | Event payload, type, entity | `SimulationEvent { sequenceNumber, ... }` | Monotonic 1-indexed counter | `engine.ts:1042-1059` |
| 15 | Hashing | Canonical Event Serialization | Serializes domain events with sorted JSON keys and excluded wall-clock metadata | `SimulationEvent` | Deterministic canonical string | Validates JSON serializability | `events/event-bus.ts:12` |
| 16 | Hashing | Canonical Event Sequence SHA-256 | Computes SHA-256 digest over the ordered sequence of canonical events | Sequence of canonical events | 64-character hex SHA-256 hash | Empty sequence produces known hash | `docs/BACKLOG.md:13` |
| 17 | API | `POST /api/simulation/reset` | REST endpoint for complete simulator zero-state reset | `{ scenarioId?: string }` | `{ status: 'reset', state: SimulationState }` | HTTP 404 if scenarioId not found | `api/routes.ts` |
| 18 | API | `GET /api/simulation/events/hash` | REST endpoint to retrieve canonical event SHA-256 hash | None | `{ hash: string, eventCount: number, simulationId: string }` | Returns current accumulated hash | Required for P0-04 |
| 19 | API | `POST /api/simulation/step` | REST endpoint to advance simulation by discrete steps/ticks | `{ deltaMs?: number, steps?: number }` | `{ simTime: number, stepsExecuted: number }` | HTTP 400 for invalid step params | Required for deterministic testing |
| 20 | Persistence | In-Memory Repositories Clear | Clears stored orders, telemetry pings, vehicles, and relationships on reset | None (`clear()`) | Cleared data stores (0 counts) | None | `persistence/in-memory/*` |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior | Required Behavior |
|---|---------|-------|-------------------|-------------------|
| 1 | Pause Controls | Vehicle at progress 0.45; `pause()` called; real clock runs 5000ms | Vehicle advances progress, completes route, and delivers order while paused | Vehicle progress remains strictly 0.45; coordinates frozen; route does not complete |
| 2 | Reset Controls | Simulation runs 100 ticks, orders delivered; `loadScenario()` called with same preset | Orders cleared in world, but `World.rng` is not reseeded; repeat run generates different orders; persistence keeps old orders | `World.rng` re-seeded to initial seed; persistence cleared; identical orders generated; 0 orphaned orders |
| 3 | Dispatch Queue | Order A dispatching (awaiting route); Order B ingested via webhook (`unshift`); Order A finishes | Line 732 calls `shift()`, popping Order B instead of Order A; Order B stranded, Order A remains in queue | Order A specifically dequeued; Order B preserved at correct position in queue |
| 4 | Queue Sorting | Orders A and B have identical `slaDeadline: 5000` | JavaScript sort returns `0`; relative order depends on engine/insertion order | Strict tie-breaking: priority rank -> creation seq -> order ID lexicographical sort |
| 5 | Dispatch Failure | Routing API returns 500 / rejects during `assignOrder` | Order remains at head of queue; `dispatching = false`; next tick retries same order infinitely | Failing order handled gracefully (exponential backoff or marked unroutable); queue does not deadlock |
| 6 | Seed Invariance | Two identical runs with `seed: 42` for 1000 ticks | Differing event IDs (`uuidv4()`), timestamps (`Date.now()`), and incident IDs | Identical event log, identical entity states, identical canonical SHA-256 hash |
| 7 | Speed 0x vs Pause | `setSpeed(0)` called | Clock delta is 0; vehicle advances because `speed === 0` makes `deltaSimMs === 0`, but `getState().status` reports `'paused'` | Speed 0 behaves identically to pause; movement and updates completely frozen |
| 8 | Empty Queue | Dispatch loop ticks with `dispatchQueue = []` | Early return `if (this.dispatchQueue.length === 0) return;` | Safe early return, zero state mutation, zero events emitted |
| 9 | High Tick Multiplier | Clock speed set to 600x (1 real sec = 10 sim hours) | Vehicle progresses in large jumps; progress can exceed 1 | `Math.min(1, progress)` clamps to 1; route completes cleanly without NaN coordinates |
| 10 | Unseeded Chaos | Chaos mode set to 'extreme'; 100 ticks executed | Generates random incident coordinates and IDs from `Math.random()` and `Date.now()` | All chaos events picked deterministically via seeded PRNG; identical across runs with same seed |

---

## 5. Interface Contracts & Data Models

### 5.1 Injected Clock Interface (`ISimulationClock`)
```typescript
export interface ISimulationClock {
  currentTime: number;
  speed: number;
  isPaused: boolean;
  tick(deltaRealMs: number): void;
  step(deltaSimMs: number): void;
  pause(): void;
  resume(): void;
  setSpeed(speed: number): void;
  getSimulatedTime(): number;
  getFormattedTime(): string;
  reset(initialSimTime?: number, speed?: number): void;
}
```

### 5.2 Enhanced Domain Event Model
```typescript
export interface SimulationEvent {
  sequenceNumber: number;
  eventId: string;
  simulationId: string;
  simTimestamp: number;
  realTimestamp?: number;
  entityType: string;
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;
}
```

### 5.3 Canonical Event Hashing Specification
1. **Canonical Event String Format**:
   ```typescript
   function canonicalizeEvent(event: SimulationEvent): string {
     return JSON.stringify({
       seq: event.sequenceNumber,
       simTime: event.simTimestamp,
       entityType: event.entityType,
       entityId: event.entityId,
       eventType: event.eventType,
       payload: canonicalizeObject(event.payload),
     });
   }
   ```
2. **Canonical Object Key Sorting**:
   Recursively sorts all object keys in lexicographical order. Numbers are formatted canonically.
3. **Sequence Digest**:
   Using `crypto.createHash('sha256')`:
   `SHA-256` digest over concatenated canonical event strings separated by newlines:
   `hash = SHA256(canonicalEvents.map(canonicalizeEvent).join('\n'))`

---

## 6. Caveats

1. **Routing Engine Isolation**: While `osm-pathfinder` routes can be fetched live, replay tests must use deterministic mock routing fixtures or cached route tables to ensure network latency and external process restarts do not alter route paths or timing during offline testing.
2. **Frontend Adaptation**: The frontend `ControlBar.tsx` already has pause/play/speed controls and scenario selector. It will benefit from an explicit "Reset" button and "Status: Paused" badge alignment once the backend returns `status: 'paused'` accurately.
3. **No Existing Commits**: Local modifications in other platform tasks (OPS-01 through DATA-02) exist in `supply-chain-platform/`. All work for P0-04 is strictly isolated to `logistics-sandbox/` and preserves all existing checks.

---

## 7. Conclusion

1. **State of the Codebase**: The `logistics-sandbox` has a robust architecture and passing test suite (55 tests pass, clean build), but currently violates determinism in four key areas:
   - Vehicle movement continues during pause due to reliance on unpaused speed multipliers.
   - `World.reset()` does not reseed `SeededRandom`, and `SimulationEngine` lacks a full state reset.
   - 11 instances of unseeded randomness (`Math.random`, `Date.now`, `uuidv4`) exist across engine, chaos, and AI modules.
   - Single-order dispatch has an asynchronous race where `unshift` during route calculation causes `shift` to discard newly arrived orders.
2. **Actionable Roadmap for Implementer**:
   - **Step 1**: Update `SimulationClock` to support `step(simDeltaMs)`, `reset()`, and strict pause gating.
   - **Step 2**: Fix `engine.advanceVehicle` and `updateVehicles` to immediately halt when `clock.isPaused` is true. Ensure `getState().status` correctly reflects `'paused'`.
   - **Step 3**: Replace all `Math.random()`, unseeded `Date.now()`, and `uuidv4()` in `engine.ts`, `chaos-engine.ts`, and `predictive-ai.ts` with seeded PRNG calls and deterministic sequence generators.
   - **Step 4**: Implement `World.reset()` PRNG reseeding and `engine.reset()` to clean world, persistence, dispatch queue, chaos, and event history. Add `POST /api/simulation/reset`.
   - **Step 5**: Fix dispatch queue handling: remove blind `shift()`; dequeue the specific order ID; add tie-breaking to `sortDispatchQueueByEDF()`.
   - **Step 6**: Implement `sequenceNumber`, canonical event serialization, and SHA-256 hash calculation in `EventBus` and `SimulationEngine`. Expose `GET /api/simulation/events/hash`.
   - **Step 7**: Write comprehensive determinism and replay tests proving identical SHA-256 hashes across repeated runs with identical seeds.

---

## 8. Verification Method

To verify the implementation of P0-04, the implementer must execute:

1. **Unit & Integration Suite**:
   ```powershell
   cd c:\Users\User\study-workspace\supply-chain-workspace\logistics-sandbox\backend
   pnpm test
   ```
   All existing 55 tests must continue to pass, plus new determinism test cases.

2. **Pause Verification**:
   - Start simulation, set vehicle en route.
   - Call `engine.pause()`. Record vehicle coordinates and progress.
   - Advance timers or wait 2000ms.
   - Assert vehicle coordinates and progress remain exactly unchanged.
   - Assert `engine.getState().status === 'paused'`.

3. **Reset Verification**:
   - Run simulation for 20 ticks.
   - Call `engine.reset()`.
   - Assert all vehicles idle at depots, 0 active orders, 0 delivered orders, 0 events in history, 0 pings in telemetry.

4. **Dispatch Queue Concurrency Verification**:
   - Trigger dispatch of Order 1 (async routing).
   - Ingest Order 2 before dispatch completes.
   - Await dispatch completion.
   - Assert Order 1 is assigned and Order 2 remains pending in dispatch queue (not dropped).

5. **Canonical Event Hash Replay Verification**:
   - Run Scenario with `seed: 42` for 100 steps -> record `hash1`.
   - Reset and run same Scenario with `seed: 42` for 100 steps -> record `hash2`.
   - Assert `hash1 === hash2`.
   - Run Scenario with `seed: 99` for 100 steps -> record `hash3`.
   - Assert `hash1 !== hash3`.
