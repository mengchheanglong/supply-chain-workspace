# Handoff Report: Race-Free Dispatch Queue & Canonical Event Sequence Hashing (Milestone M1 / P0-04)

**Agent**: `teamwork_preview_explorer_m1_3`  
**Milestone**: M1 (P0-04 Simulation Determinism)  
**Timestamp**: 2026-10-09T11:12:00Z  
**Target Repository**: `logistics-sandbox/backend`  

---

## 1. Observation

Direct code inspections, AST traces, and test suite executions in `logistics-sandbox` revealed the following exact observations:

### 1.1 Baseline Test & Build Status
- **Test execution**: `pnpm test` (`vitest run`) in `logistics-sandbox/backend`:
  - 10 test files passed (10/10): `egress-isolation.test.ts`, `neo4j-relationships.test.ts`, `persistence.test.ts`, `phase4-predictive-ai.test.ts`, `reroute.test.ts`, `resilience-and-chaos.test.ts`, `simulation.test.ts`, `telemetry.test.ts`, `vrp.test.ts`, `vrptw-scenarios.test.ts`.
  - 55 tests passed (55/55) in 1.13s.
- **Build execution**: `pnpm build` (`tsc`) in `logistics-sandbox/backend`: Exited with code 0 (clean compilation).

### 1.2 Dispatch Queue Concurrency Race in `engine.ts`
- In `backend/src/simulation/engine.ts`:
  - Line 160: `private dispatchQueue: string[] = [];`
  - Lines 668–674:
    ```typescript
    const orderId = this.dispatchQueue[0];
    const order = this.world.getOrder(orderId);
    if (!order || order.status !== 'pending') {
      this.dispatchQueue.shift();
      this.dispatching = false;
      return;
    }
    ```
  - Lines 676–735:
    ```typescript
    this.dispatcher
      .assignOrder(order, idleVehicles, this.routingClient, {
        strategy: this.activeDispatchStrategy,
        routingAlgorithm: this.activeRoutingAlgorithm,
        predictiveEngine: this.predictiveAiEngine,
        forecasts: this.predictiveAiEngine.computeDistrictForecasts(this.world, this.dispatchQueue),
      })
      .then((result: AssignmentResult | null) => {
        if (result) {
          ...
          this.dispatchQueue.shift(); // Line 732: BLIND SHIFT
        }
        this.dispatching = false;
      })
      .catch((err) => {
        console.error('[SimulationEngine] Dispatch error:', err);
        this.dispatching = false;
      });
    ```
  - **Concurrent Queue Modifications**:
    While `assignOrder` is waiting on the asynchronous routing HTTP call (`routingClient.calculateRoute` via `fetch` to `osm-pathfinder`), four external sources prepend or mutate `this.dispatchQueue`:
    1. Line 402 (`ingestEcommerceOrder`):
       `this.dispatchQueue.unshift(order.id); // Place at top of queue for immediate dispatch`
    2. Line 1203 (`mitigateSlaBreachRisk`):
       ```typescript
       const qIdx = this.dispatchQueue.indexOf(order.id);
       if (qIdx > -1) this.dispatchQueue.splice(qIdx, 1);
       this.dispatchQueue.unshift(order.id);
       ```
    3. Line 1607 (Vehicle breakdown recovery):
       `this.dispatchQueue.unshift(order.id);`
    4. Line 1832 (`injectCustomOrder`):
       `this.dispatchQueue.unshift(order.id);`
  - **Concrete Concurrency Defect**:
    When an unshift occurs during the async window of `assignOrder('ORD-1')`:
    - `dispatchQueue` shifts from `['ORD-1']` to `['ORD-URGENT', 'ORD-1']`.
    - When `assignOrder` resolves, line 732 executes `this.dispatchQueue.shift()`.
    - Index 0 is popped: `'ORD-URGENT'` is removed from the queue!
    - `'ORD-URGENT'` is dropped completely, never assigned, and permanently lost.
    - Meanwhile, `'ORD-1'` (which was assigned) remains stranded at index 0.

### 1.3 Unstable Earliest Deadline First (EDF) Sorting in `engine.ts`
- In `backend/src/simulation/engine.ts`:
  - Lines 528–536:
    ```typescript
    private sortDispatchQueueByEDF(): void {
      this.dispatchQueue.sort((idA, idB) => {
        const orderA = this.world.getOrder(idA);
        const orderB = this.world.getOrder(idB);
        const deadlineA = orderA?.slaDeadline ?? Infinity;
        const deadlineB = orderB?.slaDeadline ?? Infinity;
        return deadlineA - deadlineB;
      });
    }
    ```
  - **Concrete Instability Defect**:
    When `deadlineA === deadlineB`, `deadlineA - deadlineB === 0`.
    No tie-breaking exists. Orders created in the same batch or with identical SLA time windows produce equal deadlines. In JavaScript V8 sort, returning 0 yields unstable or insertion-order-dependent outcomes across different Node/V8 versions or order ingestion timings, breaking replay reproducibility.

### 1.4 Missing Monotonic Event Sequencing
- In `backend/src/world/types.ts`:
  - Lines 105–114:
    ```typescript
    export interface SimulationEvent {
      eventId: string;
      simulationId: string;
      simTimestamp: number;
      realTimestamp: number;
      entityType: string;
      entityId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
    ```
    There is NO `sequenceNumber` field.
- In `backend/src/events/event-bus.ts`:
  - Lines 8–16:
    ```typescript
    export class EventBus {
      private emitter = new EventEmitter();
      private history: SimulationEvent[] = [];

      public emit(event: SimulationEvent): void {
        this.history.push(event);
        this.emitter.emit(event.eventType, event);
        this.emitter.emit('*', event);
      }
    ```
    There is NO monotonic sequence counter, NO validation, and NO reset/clear method.
- In `backend/src/simulation/engine.ts`:
  - Lines 1042–1059:
    ```typescript
    public emitEvent(
      entityType: string,
      entityId: string,
      eventType: string,
      payload: Record<string, unknown>
    ): void {
      const event: SimulationEvent = {
        eventId: uuidv4(),
        simulationId: this.simulationId,
        simTimestamp: this.clock.getSimulatedTime(),
        realTimestamp: Date.now(),
        entityType,
        entityId,
        eventType,
        payload,
      };
      this.eventBus.emit(event);
    }
    ```
    Every domain event emitted across the entire simulation (42 call sites) flows through `engine.emitEvent()`. None assigns a monotonic sequence number.

### 1.5 Canonical Event Hashing & Volatile Wall-Clock Fields
- Currently, NO canonical serialization or SHA-256 event sequence hash exists in `EventBus`, `SimulationEngine`, or routes.
- **Volatile Wall-Clock Contamination**:
  - `SimulationEvent.realTimestamp` is `Date.now()`.
  - `order.assigned` event payload includes `queryTimeMs: result.route.queryTimeMs` (`engine.ts:723`), which is measured via wall-clock timing of external HTTP routing calls (`client.ts:86`).
  - Including `realTimestamp` or `queryTimeMs` in the hash digest guarantees that two identical runs with the same seed will produce divergent hashes.

### 1.6 Simulation Routes & API Entry Points
- In `backend/src/api/routes.ts`:
  - Mount point in `backend/src/index.ts`: `app.use('/api', setupRoutes(simulationEngine));`
  - Routes like `/simulation/state`, `/simulation/start`, `/simulation/pause` exist.
  - Endpoint `GET /simulation/events/hash` does NOT exist.

---

## 2. Logic Chain

1. **Race-free dispatch requires targeted key removal**:
   - Observations 1.2 prove that blind `this.dispatchQueue.shift()` at lines 671 and 732 assumes `orderId` is always at index 0 upon promise resolution.
   - Because `assignOrder` is asynchronous (network I/O to `osm-pathfinder`), intervening events call `this.dispatchQueue.unshift(newOrderId)`.
   - When `assignOrder` completes, blind `shift()` evicts `newOrderId` instead of the assigned order, causing dropped orders and phantom pending orders.
   - Replacing `shift()` with a deterministic removal helper:
     ```typescript
     private dequeueOrder(orderId: string): boolean {
       const idx = this.dispatchQueue.indexOf(orderId);
       if (idx !== -1) {
         this.dispatchQueue.splice(idx, 1);
         return true;
       }
       return false;
     }
     ```
     and invoking `this.dequeueOrder(order.id)` on assignment strictly removes only the assigned order, leaving any unshifted or pushed orders safely intact at their respective indices.

2. **Stable EDF sorting requires strict 4-tier lexicographical tie-breaking**:
   - Observations 1.3 show that `deadlineA - deadlineB` returns 0 on equal deadlines.
   - To achieve mathematical determinism, the comparator must form a total ordering over all orders:
     - **Tier 1: SLA Deadline** (`deadlineA - deadlineB`, earliest first).
     - **Tier 2: Priority Rank** (`urgent` = 0, `express` = 1, `standard` = 2, fallback = 3).
     - **Tier 3: Creation Sequence / Timestamp** (`creationSeq ?? createdAt`, earliest created first).
     - **Tier 4: Order ID** (`idA.localeCompare(idB)`).
   - Because all order IDs in the queue are unique strings, Tier 4 strictly returns non-zero for any two distinct queue elements. The sort is provably total and invariant across all environments.

3. **Monotonic event sequencing requires coordinated counters**:
   - Observations 1.4 show that domain events lack sequential tracking.
   - Introducing an incremental counter `this.eventSequenceNumber` in `SimulationEngine` assigns `1, 2, 3...` to every emitted event.
   - Introducing fallback sequence number validation in `EventBus.emit()` ensures that any event emitted directly to the bus is also assigned a gapless, strictly monotonic sequence number.
   - Resetting this counter to 0 during simulation reset guarantees repeatable indexing from 1.

4. **Canonical hashing requires key sorting and exclusion of volatile wall-clock properties**:
   - Observations 1.5 reveal that `realTimestamp` and `queryTimeMs` contain non-deterministic wall-clock and hardware timing.
   - Cryptographic hashing (SHA-256) requires:
     1. Normalizing each event into a canonical JSON object: `{ seq, simTime, entityType, entityId, eventType, payload }`.
     2. Normalizing `entityId` when `entityType === 'simulation'` to `'simulation'` so run-specific UUIDs do not pollute scenario replay digests.
     3. Filtering out volatile keys (`realTimestamp`, `real_timestamp`, `queryTimeMs`, `query_time_ms`, `wallClockTime`, `executionTimeMs`) from both top-level and recursive payload objects.
     4. Sorting all object keys lexicographically (`Object.keys().sort()`).
     5. Normalizing numbers (clamping `NaN`/`Infinity` to `null`, `-0` to `0`).
     6. Joining the canonical event lines with newline (`\n`) delimiters and feeding the UTF-8 stream to `crypto.createHash('sha256').digest('hex')`.
   - This guarantees that two runs with identical scenario seeds produce identical canonical event sequences and identical 64-character hex digests.

5. **Exposing the canonical hash via REST satisfies verification contracts**:
   - Adding `GET /api/simulation/events/hash` invoking `engine.getEventSequenceHash()` returns `{ hash, eventCount, simulationId }`.
   - This provides the automated test harness with an opaque-box oracle to assert replay fidelity without inspecting internal memory.

---

## 3. Implementation Design & Proposed Code Changes

### 3.1 Sub-Task 1: Race-Free Dispatch Queue (`engine.ts`)

#### Target File: `logistics-sandbox/backend/src/simulation/engine.ts`

**Proposed Changes**:
1. Add private helper method `dequeueOrder(orderId: string): boolean`:
   ```typescript
   /**
    * Safely remove a specific order ID from the dispatch queue.
    * Prevents concurrency races where blind shift() evicts unshifted orders.
    */
   private dequeueOrder(orderId: string): boolean {
     const idx = this.dispatchQueue.indexOf(orderId);
     if (idx !== -1) {
       this.dispatchQueue.splice(idx, 1);
       return true;
     }
     return false;
   }
   ```
2. Replace Line 671:
   ```typescript
   // BEFORE:
   if (!order || order.status !== 'pending') {
     this.dispatchQueue.shift();
     this.dispatching = false;
     return;
   }

   // AFTER:
   if (!order || order.status !== 'pending') {
     this.dequeueOrder(orderId);
     this.dispatching = false;
     return;
   }
   ```
3. Replace Line 732:
   ```typescript
   // BEFORE:
             this.emitEvent('vehicle', vehicle.id, 'vehicle.dispatched', {
               orderId: order.id,
               routePoints: result.route.path.length,
               distanceM: result.route.distanceM,
             });
           }
           this.dispatchQueue.shift();
         }
         this.dispatching = false;

   // AFTER:
             this.emitEvent('vehicle', vehicle.id, 'vehicle.dispatched', {
               orderId: order.id,
               routePoints: result.route.path.length,
               distanceM: result.route.distanceM,
             });
           }
           // Race-free: Dequeue specifically the assigned order by ID
           this.dequeueOrder(order.id);
         }
         this.dispatching = false;
   ```

---

### 3.2 Sub-Task 2: Stable EDF Sorting (`engine.ts`)

#### Target File: `logistics-sandbox/backend/src/simulation/engine.ts`

**Proposed Changes**:
Replace `sortDispatchQueueByEDF()` (lines 528–536):
```typescript
// BEFORE:
  private sortDispatchQueueByEDF(): void {
    this.dispatchQueue.sort((idA, idB) => {
      const orderA = this.world.getOrder(idA);
      const orderB = this.world.getOrder(idB);
      const deadlineA = orderA?.slaDeadline ?? Infinity;
      const deadlineB = orderB?.slaDeadline ?? Infinity;
      return deadlineA - deadlineB;
    });
  }

// AFTER:
  /**
   * Sort pending dispatch queue using Earliest Deadline First (EDF) with strict multi-tier tie-breaking:
   * 1. SLA Deadline (earliest first)
   * 2. Priority Rank (urgent < express < standard)
   * 3. Creation Sequence / Timestamp (FIFO among identical urgency)
   * 4. Order ID (stable lexicographical tie-breaker)
   */
  private sortDispatchQueueByEDF(): void {
    const PRIORITY_RANKS: Record<string, number> = {
      urgent: 0,
      express: 1,
      standard: 2,
    };

    this.dispatchQueue.sort((idA, idB) => {
      const orderA = this.world.getOrder(idA);
      const orderB = this.world.getOrder(idB);

      // Tier 1: SLA Deadline (EDF)
      const deadlineA = orderA?.slaDeadline ?? Infinity;
      const deadlineB = orderB?.slaDeadline ?? Infinity;
      if (deadlineA !== deadlineB) {
        return deadlineA - deadlineB;
      }

      // Tier 2: Priority Rank
      const rankA = orderA?.priority ? (PRIORITY_RANKS[orderA.priority] ?? 2) : 2;
      const rankB = orderB?.priority ? (PRIORITY_RANKS[orderB.priority] ?? 2) : 2;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // Tier 3: Creation Sequence / Timestamp
      const seqA = orderA?.creationSeq ?? orderA?.createdAt ?? 0;
      const seqB = orderB?.creationSeq ?? orderB?.createdAt ?? 0;
      if (seqA !== seqB) {
        return seqA - seqB;
      }

      // Tier 4: Stable Order ID Tie-Breaker
      return idA.localeCompare(idB);
    });
  }
```

---

### 3.3 Sub-Task 3: Monotonic Event Sequencing (`types.ts`, `event-bus.ts`, `engine.ts`)

#### Target 1: `backend/src/world/types.ts`
Add `sequenceNumber: number;` and optional `creationSeq?: number;`:
```typescript
export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  priority?: OrderPriority;
  slaDeadline?: number;
  slaDurationMin?: number;
  slaStatus?: SlaStatus;
  items: OrderItem[];
  totalWeight_kg: number;
  pickupLocation: Coordinate;
  deliveryLocation: Coordinate;
  assignedVehicleId: string | null;
  createdAt: number;
  creationSeq?: number;
  assignedAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  estimatedDeliveryTime: number | null;
}

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

#### Target 2: `frontend/src/types/index.ts`
Update `SimulationEvent` interface:
```typescript
export interface SimulationEvent {
  sequenceNumber?: number;
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

#### Target 3: `backend/src/events/event-bus.ts`
```typescript
import { EventEmitter } from 'events';
import { SimulationEvent } from '../world/types.js';

export class EventBus {
  private emitter = new EventEmitter();
  private history: SimulationEvent[] = [];
  private sequenceCounter: number = 0;

  public emit(event: SimulationEvent): void {
    if (typeof event.sequenceNumber !== 'number' || event.sequenceNumber <= 0) {
      this.sequenceCounter++;
      event.sequenceNumber = this.sequenceCounter;
    } else {
      this.sequenceCounter = Math.max(this.sequenceCounter, event.sequenceNumber);
    }
    this.history.push(event);
    this.emitter.emit(event.eventType, event);
    this.emitter.emit('*', event);
  }

  public on(eventType: string, handler: (event: SimulationEvent) => void): void {
    this.emitter.on(eventType, handler);
  }

  public off(eventType: string, handler: (event: SimulationEvent) => void): void {
    this.emitter.off(eventType, handler);
  }

  public getHistory(): SimulationEvent[] {
    return [...this.history];
  }

  public clear(): void {
    this.history = [];
    this.sequenceCounter = 0;
  }
}
```

#### Target 4: `backend/src/simulation/engine.ts`
Add sequence state and update `emitEvent`:
```typescript
export class SimulationEngine {
  ...
  private eventSequenceNumber: number = 0;
  ...

  public emitEvent(
    entityType: string,
    entityId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): void {
    this.eventSequenceNumber++;
    const event: SimulationEvent = {
      sequenceNumber: this.eventSequenceNumber,
      eventId: `EVT-${this.simulationId.slice(0, 8)}-${String(this.eventSequenceNumber).padStart(6, '0')}`,
      simulationId: this.simulationId,
      simTimestamp: this.clock.getSimulatedTime(),
      realTimestamp: Date.now(),
      entityType,
      entityId,
      eventType,
      payload,
    };
    this.eventBus.emit(event);
  }
```

---

### 3.4 Sub-Task 4: Canonical Event Hashing (`canonical-hash.ts`)

#### Target File: `logistics-sandbox/backend/src/events/canonical-hash.ts` (New File)
```typescript
/**
 * @fileoverview Canonical Event Serialization and SHA-256 Hashing.
 *
 * Implements deterministic serialization of simulation event sequences:
 * - Recursive lexicographical key sorting for all JSON objects.
 * - Explicit exclusion of volatile wall-clock fields (realTimestamp, queryTimeMs).
 * - Finite number normalization.
 * - Deterministic SHA-256 digest computation over newline-delimited canonical event strings.
 */

import { createHash } from 'node:crypto';
import { SimulationEvent } from '../world/types.js';

export const VOLATILE_EXCLUDED_KEYS = new Set([
  'realTimestamp',
  'real_timestamp',
  'queryTimeMs',
  'query_time_ms',
  'wallClockTime',
  'wall_clock_time',
  'executionTimeMs',
  'execution_time_ms',
]);

/**
 * Recursively canonicalize any JSON-serializable value.
 */
export function canonicalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    if (Object.is(val, -0)) return 0;
    return val;
  }
  if (typeof val === 'boolean' || typeof val === 'string') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => canonicalizeValue(item));
  }
  if (typeof val === 'object') {
    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>)
      .filter((k) => !VOLATILE_EXCLUDED_KEYS.has(k))
      .sort();
    for (const key of keys) {
      const propVal = (val as Record<string, unknown>)[key];
      if (propVal !== undefined && typeof propVal !== 'function') {
        sortedObj[key] = canonicalizeValue(propVal);
      }
    }
    return sortedObj;
  }
  return String(val);
}

/**
 * Produce a canonical single-line JSON string representing a SimulationEvent.
 */
export function canonicalizeEvent(event: SimulationEvent): string {
  // If entity is the simulation itself, normalize entityId to avoid run-specific UUID divergence
  const normalizedEntityId =
    event.entityType === 'simulation' ? 'simulation' : event.entityId;

  const canonicalObj = {
    seq: event.sequenceNumber,
    simTime: event.simTimestamp,
    entityType: event.entityType,
    entityId: normalizedEntityId,
    eventType: event.eventType,
    payload: canonicalizeValue(event.payload),
  };
  return JSON.stringify(canonicalObj);
}

/**
 * Compute the SHA-256 digest over the ordered canonical event sequence.
 */
export function computeCanonicalEventSequenceHash(events: SimulationEvent[]): string {
  const sortedEvents = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const lines = sortedEvents.map(canonicalizeEvent);
  const stream = lines.join('\n');
  return createHash('sha256').update(stream, 'utf8').digest('hex');
}
```

---

### 3.5 Sub-Task 5: API Endpoint `GET /api/simulation/events/hash`

#### Target 1: `logistics-sandbox/backend/src/simulation/engine.ts`
Export method on `SimulationEngine`:
```typescript
import { computeCanonicalEventSequenceHash } from '../events/canonical-hash.js';
...
  /**
   * Compute the canonical event sequence SHA-256 hash across all emitted events.
   */
  public getEventSequenceHash(): { hash: string; eventCount: number; simulationId: string } {
    const events = this.eventBus.getHistory();
    const hash = computeCanonicalEventSequenceHash(events);
    return {
      hash,
      eventCount: events.length,
      simulationId: this.simulationId,
    };
  }
```

#### Target 2: `logistics-sandbox/backend/src/api/routes.ts`
Register endpoint in `setupRoutes(engine: SimulationEngine)`:
```typescript
  // Canonical Event Sequence Hash Endpoint (P0-04 Determinism Oracle)
  router.get('/simulation/events/hash', (req, res) => {
    res.json(engine.getEventSequenceHash());
  });
```

---

## 4. Caveats

1. **Routing Query Network Latency & Fallbacks**:
   When osm-pathfinder is offline, `RoutingClient` uses `haversineDistanceSimple` fallback. Because `fallback_direct` has `queryTimeMs: 0`, while a live service reports variable elapsed wall time (`queryTimeMs: 1.4ms`), canonical serialization's exclusion of `queryTimeMs` is mandatory to keep offline and online replay digests comparable.
2. **Boundary with Sibling Agents (m1_1 & m1_2)**:
   - Sibling `teamwork_preview_explorer_m1_1` designs discrete clock stepping (`SimulationClock.step`) and strict pause freezing.
   - Sibling `teamwork_preview_explorer_m1_2` designs `World.reset()` RNG reseeding and replacing unseeded `Math.random()` and `Date.now()`.
   - Our design for event sequence hashing and race-free dispatch integrates seamlessly with both: `engine.eventBus.clear()` and `this.eventSequenceNumber = 0` will be invoked by `m1_2`'s `engine.reset()`.
3. **SimulationId Normalization**:
   In `canonicalizeEvent`, `entityId` for `entityType === 'simulation'` is normalized to `'simulation'` so that even if `simulationId` was generated as a distinct UUID between runs, the event sequence hash remains purely seed- and logic-dependent.

---

## 5. Conclusion

1. **Root Cause Analysis Confirmed**:
   - The dispatch queue drop bug is conclusively traced to `engine.ts:732`'s blind `shift()` after asynchronous network routing, which discards whatever order was unshifted during the network call.
   - The dispatch ordering instability is conclusively traced to `engine.ts:528-536`'s lack of tie-breakers when two orders share an SLA deadline.
   - Non-deterministic event logs are conclusively traced to the absence of monotonic sequence numbering and the inclusion of volatile wall-clock timestamps (`realTimestamp`, `queryTimeMs`).
2. **Actionable Implementation Plan**:
   - Replace blind `shift()` with `this.dequeueOrder(order.id)`.
   - Upgrade `sortDispatchQueueByEDF()` with the 4-tier strict comparator.
   - Add monotonic `sequenceNumber` to `SimulationEvent`, `EventBus`, and `SimulationEngine`.
   - Implement `canonical-hash.ts` for sorted JSON serialization and SHA-256 digest computation.
   - Expose `GET /api/simulation/events/hash`.

---

## 6. Verification Method

To independently verify the implementation, the implementer must execute:

### 6.1 Unit Test Suite
Run vitest suite in `logistics-sandbox/backend`:
```powershell
cd c:\Users\User\study-workspace\supply-chain-workspace\logistics-sandbox\backend
pnpm test
```
All existing 55 tests must pass with 0 regressions.

### 6.2 New Verification Test File: `backend/tests/determinism-events-queue.test.ts`
Implement the following comprehensive verification suite:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { SimulationEngine } from '../src/simulation/engine.js';
import { World } from '../src/world/world.js';
import { defaultScenario } from '../src/scenarios/default.js';
import {
  canonicalizeValue,
  canonicalizeEvent,
  computeCanonicalEventSequenceHash,
} from '../src/events/canonical-hash.js';
import type { SimulationEvent } from '../src/world/types.js';

describe('P0-04: Determinism, Dispatch Queue & Canonical Event Hashing', () => {
  it('dequeues specific order ID without dropping unshifted orders during async routing', async () => {
    const engine = new SimulationEngine();
    const queue = (engine as any).dispatchQueue as string[];
    queue.length = 0;
    queue.push('ORD-001', 'ORD-002');

    // Simulate async assignOrder where unshift happens mid-flight
    const orderBeingAssigned = { id: 'ORD-001', status: 'pending' };
    
    // Mid-flight: urgent order unshifted
    queue.unshift('ORD-URGENT');
    expect(queue).toEqual(['ORD-URGENT', 'ORD-001', 'ORD-002']);

    // Dequeue specific assigned order
    (engine as any).dequeueOrder(orderBeingAssigned.id);

    // Assert: ORD-URGENT remains at index 0, ORD-002 remains at index 1
    expect(queue).toEqual(['ORD-URGENT', 'ORD-002']);
  });

  it('strictly tie-breaks EDF sorting across identical SLA deadlines', () => {
    const engine = new SimulationEngine();
    const world = (engine as any).world as World;

    // Seed orders with identical SLA deadlines but different priorities and IDs
    const now = 10000;
    const orderA = { id: 'ORD-B-STD', slaDeadline: 50000, priority: 'standard', createdAt: 100, status: 'pending' } as any;
    const orderB = { id: 'ORD-A-STD', slaDeadline: 50000, priority: 'standard', createdAt: 100, status: 'pending' } as any;
    const orderC = { id: 'ORD-C-URG', slaDeadline: 50000, priority: 'urgent', createdAt: 200, status: 'pending' } as any;
    const orderD = { id: 'ORD-D-EXP', slaDeadline: 50000, priority: 'express', createdAt: 150, status: 'pending' } as any;

    world.addOrder(orderA);
    world.addOrder(orderB);
    world.addOrder(orderC);
    world.addOrder(orderD);

    const queue = (engine as any).dispatchQueue as string[];
    queue.length = 0;
    queue.push('ORD-B-STD', 'ORD-A-STD', 'ORD-C-URG', 'ORD-D-EXP');

    (engine as any).sortDispatchQueueByEDF();

    // Priority rank: urgent (C) -> express (D) -> standard (A, B tie-broken by ID: 'ORD-A-STD' < 'ORD-B-STD')
    expect(queue).toEqual(['ORD-C-URG', 'ORD-D-EXP', 'ORD-A-STD', 'ORD-B-STD']);
  });

  it('assigns monotonic sequential numbers to domain events', () => {
    const engine = new SimulationEngine();
    engine.emitEvent('test', '1', 'test.event1', {});
    engine.emitEvent('test', '2', 'test.event2', {});
    engine.emitEvent('test', '3', 'test.event3', {});

    const history = engine.eventBus.getHistory();
    const seqs = history.slice(-3).map((e) => e.sequenceNumber);
    expect(seqs[1]).toBe(seqs[0] + 1);
    expect(seqs[2]).toBe(seqs[1] + 1);
  });

  it('excludes volatile wall-clock fields and sorts payload keys canonically', () => {
    const event1: SimulationEvent = {
      sequenceNumber: 1,
      eventId: 'EVT-001',
      simulationId: 'SIM-RUN-1',
      simTimestamp: 1000,
      realTimestamp: 1728471000000,
      entityType: 'order',
      entityId: 'ORD-1',
      eventType: 'order.assigned',
      payload: { z: 100, a: 200, queryTimeMs: 12.5 },
    };

    const event2: SimulationEvent = {
      sequenceNumber: 1,
      eventId: 'EVT-002',
      simulationId: 'SIM-RUN-2',
      simTimestamp: 1000,
      realTimestamp: 1728479999999, // Divergent wall clock
      entityType: 'order',
      entityId: 'ORD-1',
      eventType: 'order.assigned',
      payload: { a: 200, z: 100, queryTimeMs: 98.2 }, // Divergent key order & queryTimeMs
    };

    const canon1 = canonicalizeEvent(event1);
    const canon2 = canonicalizeEvent(event2);

    expect(canon1).toBe(canon2);
    expect(computeCanonicalEventSequenceHash([event1])).toBe(computeCanonicalEventSequenceHash([event2]));
  });

  it('computes identical SHA-256 event sequence hashes across identical runs', () => {
    const eventsRunA: SimulationEvent[] = [
      { sequenceNumber: 1, eventId: '1', simulationId: 'A', simTimestamp: 0, entityType: 'simulation', entityId: 'A', eventType: 'simulation.started', payload: { seed: 42 } },
      { sequenceNumber: 2, eventId: '2', simulationId: 'A', simTimestamp: 100, entityType: 'order', entityId: 'ORD-1', eventType: 'order.created', payload: { weight: 5 } },
    ];

    const eventsRunB: SimulationEvent[] = [
      { sequenceNumber: 1, eventId: '9', simulationId: 'B', simTimestamp: 0, entityType: 'simulation', entityId: 'B', eventType: 'simulation.started', payload: { seed: 42 } },
      { sequenceNumber: 2, eventId: '10', simulationId: 'B', simTimestamp: 100, entityType: 'order', entityId: 'ORD-1', eventType: 'order.created', payload: { weight: 5 } },
    ];

    const hashA = computeCanonicalEventSequenceHash(eventsRunA);
    const hashB = computeCanonicalEventSequenceHash(eventsRunB);

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

### 6.3 REST Endpoint Verification
Exercise `GET /api/simulation/events/hash`:
```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/simulation/events/hash -Method GET
```
Expected output:
```json
{
  "hash": "<64-character lowercase hex string>",
  "eventCount": 42,
  "simulationId": "<string>"
}
```
Status code: `200 OK`.
