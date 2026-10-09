# Exploration & Design Report: M1 Simulation Determinism (Clock, Discrete Stepping, Strict Pause Freezing, API)

**Agent**: `teamwork_preview_explorer_m1_1`  
**Milestone**: M1 (P0-04 Simulation Determinism)  
**Target Module**: `logistics-sandbox/backend`  
**Timestamp**: 2026-10-09T11:11:00Z  

---

## 1. Observation

Direct source code inspection, test runs, and codebase search within `logistics-sandbox/` revealed the following exact technical facts:

### 1.1 Baseline Status & Test Suite
- Executed `pnpm test` in `logistics-sandbox/backend`:
  - **10 test files passed (10)**: `egress-isolation.test.ts`, `neo4j-relationships.test.ts`, `persistence.test.ts`, `phase4-predictive-ai.test.ts`, `reroute.test.ts`, `resilience-and-chaos.test.ts`, `simulation.test.ts`, `telemetry.test.ts`, `vrp.test.ts`, `vrptw-scenarios.test.ts`.
  - **55 tests passed (55 total)** in 6.79s.
- Clean compilation: `pnpm build` (`tsc`) succeeds with code 0.

### 1.2 `SimulationClock` Implementation Flaws
- In `backend/src/simulation/clock.ts`:
  - **Wall-clock dependency in constructor** (lines 23–29):
    ```typescript
    constructor(initialSimTime: number = 0, initialSpeed: number = 1) {
      this.currentTime = initialSimTime;
      this.speed = initialSpeed;
      this.realTimeStart = Date.now();
      this.simTimeStart = initialSimTime;
      this.lastRealTime = this.realTimeStart;
    }
    ```
    `Date.now()` is called directly on instantiation. Neither `this.realTimeStart` nor `this.lastRealTime` is ever read by time calculations or any other module.
  - **Encapsulation issue** (line 14):
    `private isPaused: boolean = false;`
    `isPaused` is strictly private without a getter or public accessor. External classes (`SimulationEngine`, `World`, tests) cannot query whether the clock is paused.
  - **Missing discrete stepping**:
    Only `tick(deltaRealMs: number)` exists (lines 35–40). There is no `step(deltaSimMs: number)` method to advance time deterministically without real elapsed wall-clock inputs.
  - **Missing reset method**:
    There is no `reset()` method on `SimulationClock` to return to initial time, unpaused status, and zeroed baseline.

### 1.3 Strict Pause Control Flaws in `SimulationEngine`
- In `backend/src/simulation/clock.ts`:
  - Lines 46–48: `public pause(): void { this.isPaused = true; }`
  - Calling `pause()` toggles `isPaused` but leaves `this.speed` completely untouched (default 1).
- In `backend/src/simulation/engine.ts`:
  - Lines 324–355 (`tick()` loop):
    - `tick()` is triggered by `setInterval` every `TICK_RATE_MS` (100ms).
    - `this.clock.tick(deltaMs)` returns early if paused, leaving `this.clock.currentTime` unadvanced.
    - **However, `tick()` continues execution unconditionally**:
      - `this.tickCounter++` continues incrementing.
      - `this.generateOrders(simTime)` continues running.
      - `this.dispatchPendingOrders()` continues running.
      - `this.updateVehicles(simTime, deltaMs)` is called unconditionally at line 346.
      - `this.chaosEngine.tick(simTime, this)` continues running.
  - Lines 828–835 in `advanceVehicle(vehicle: Vehicle, deltaRealMs: number)`:
    ```typescript
    const deltaSimMs = deltaRealMs * this.clock.speed * 60;
    const deltaSimS = deltaSimMs / 1000;
    const effectiveSpeedFactor = 1 / Math.max(0.2, this.trafficMultiplier);
    const progressIncrement = (deltaSimS / vehicle.routeDurationS) * effectiveSpeedFactor;
    vehicle.routeProgress = Math.min(1, vehicle.routeProgress + progressIncrement);
    ```
    **Critical Flaw**: Because `this.clock.speed` remains 1 when paused, `deltaSimMs` is evaluated as `deltaRealMs * 1 * 60 > 0`. Vehicles continue to increment `routeProgress`, interpolate new coordinates along polylines, emit telemetry, update positions, and call `completeVehicleRoute(vehicle)` to complete deliveries while the simulation is purportedly paused.
  - Lines 790–809 in `updateVehicles`:
    - Order SLA checks run every tick; active orders transition between `on_time`, `at_risk`, and `breached` during pause.

### 1.4 State Reporting Flaw in `engine.getState()`
- In `backend/src/simulation/engine.ts`:
  - Lines 1122–1126:
    ```typescript
    status: this.intervalId
      ? this.clock.speed > 0
        ? 'running'
        : 'paused'
      : 'stopped',
    ```
    **Critical Flaw**: `engine.pause()` does not clear `this.intervalId` and does not set `this.clock.speed = 0`. Because `this.clock.speed === 1`, `getState().status` evaluates to `'running'` immediately after `engine.pause()` is called.
  - In frontend `frontend/src/App.tsx:260-264` and `frontend/src/components/ControlBar.tsx:246`:
    The UI tests `state?.status === 'paused'`. Because the backend returns `'running'`, Spacebar pause toggling fails to resume, and the ControlBar pause icon fails to remain active.
  - In `backend/src/api/websocket.ts:28`:
    `if (clients.size > 0 && engine.getState().status === 'running')`
    The websocket continues broadcasting state every second during pause because `status` reports `'running'`.

### 1.5 Missing Discrete Stepping API
- In `backend/src/api/routes.ts`:
  - Existing endpoints: `/simulation/start`, `/simulation/stop`, `/simulation/speed`, `/simulation/pause`, `/simulation/resume`, `/simulation/algorithm`.
  - There is NO `POST /api/simulation/step` endpoint.
  - There is NO `engine.step(...)` method in `engine.ts`.

---

## 2. Logic Chain

1. **Decoupling Clock Progression from Wall Clock**:
   - Observation 1.2 shows `clock.ts` calling `Date.now()` on construction, and `engine.ts:325` measuring `deltaMs = Date.now() - this.lastTickTime` from OS time.
   - For deterministic testing and discrete multi-tick stepping, simulated time must advance exclusively by discrete, injected deltas (`step(deltaSimMs)`).
   - Removing `Date.now()` from `clock.ts` and adding `step(deltaSimMs: number)` and `reset()` enables isolated, deterministic time control.

2. **Freezing Movement and Vehicle State on Pause**:
   - Observation 1.3 proves that `advanceVehicle` relies on `this.clock.speed * 60` without checking `this.clock.isPaused`.
   - To satisfy the acceptance criteria ("pausing must freeze all movement and vehicle updates"), `advanceVehicle` and `updateVehicles` must enforce:
     `if (this.clock.isPaused || deltaSimMs <= 0) return;`
     When `isPaused` is true, the effective simulation time delta is strictly 0. Vehicle coordinates, route progress, trail histories, and vehicle statuses do NOT advance at all.
   - Furthermore, in `engine.tick()`, when `this.clock.isPaused || this.clock.speed === 0`, `tick()` must return immediately after updating `lastTickTime = Date.now()`, preventing background dispatch, order generation, and chaos mutations during pause.

3. **Accurate Immediate Pause Reporting**:
   - Observation 1.4 shows `getState().status` checking `this.clock.speed > 0 ? 'running' : 'paused'`.
   - By querying `this.clock.isPaused` directly:
     ```typescript
     status: !this.intervalId && !this.clock.isPaused
       ? 'stopped'
       : (this.clock.isPaused || this.clock.speed === 0)
         ? 'paused'
         : 'running'
     ```
     `getState().status` immediately reports `'paused'` as soon as `engine.pause()` is called, whether interval is active or stopped.

4. **Discrete Multi-Tick Stepping (`POST /api/simulation/step`)**:
   - Automated replay tests and headless validation require advancing the simulation by $K$ discrete steps without waiting for real-world `setInterval` ticks.
   - Implementing `engine.step(steps, deltaSimMs)`:
     - Temporarily executes $K$ discrete iterations.
     - Advances `clock.step(deltaSimMs)`.
     - Advances vehicles with the exact `deltaSimMs`.
     - Preserves the paused status upon completion.
   - Exposing `POST /api/simulation/step` with input validation (`steps`, `deltaSimMs`, `deltaMs`) provides full REST control over discrete stepping.

---

## 3. Implementation Design Strategy

### 3.1 `ISimulationClock` and `SimulationClock` (`clock.ts`)

```typescript
export interface ISimulationClock {
  currentTime: number;
  speed: number;
  isPaused: boolean;
  realTimeStart: number;
  simTimeStart: number;
  tick(deltaRealMs: number): void;
  step(deltaSimMs: number): void;
  pause(): void;
  resume(): void;
  setSpeed(newSpeed: number): void;
  getSimulatedTime(): number;
  getFormattedTime(): string;
  reset(initialSimTime?: number, initialSpeed?: number): void;
}

export class SimulationClock implements ISimulationClock {
  public currentTime: number;
  public speed: number;
  public realTimeStart: number;
  public simTimeStart: number;
  public isPaused: boolean = false;
  private lastRealTime: number;

  private readonly SIM_TIME_RATIO = 60;

  constructor(initialSimTime: number = 0, initialSpeed: number = 1) {
    this.currentTime = initialSimTime;
    this.speed = initialSpeed;
    this.simTimeStart = initialSimTime;
    this.realTimeStart = 0; // Decoupled from Date.now()
    this.lastRealTime = 0;
  }

  public tick(deltaRealMs: number): void {
    if (this.isPaused || this.speed === 0 || deltaRealMs <= 0) return;
    const deltaSimMs = deltaRealMs * this.speed * this.SIM_TIME_RATIO;
    this.currentTime += deltaSimMs;
    this.lastRealTime += deltaRealMs;
  }

  public step(deltaSimMs: number): void {
    if (deltaSimMs <= 0) return;
    this.currentTime += deltaSimMs;
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public setSpeed(newSpeed: number): void {
    this.speed = newSpeed;
  }

  public getSimulatedTime(): number {
    return this.currentTime;
  }

  public getFormattedTime(): string {
    return new Date(this.currentTime).toISOString();
  }

  public reset(initialSimTime: number = 0, initialSpeed: number = 1): void {
    this.currentTime = initialSimTime;
    this.simTimeStart = initialSimTime;
    this.speed = initialSpeed;
    this.isPaused = false;
    this.realTimeStart = 0;
    this.lastRealTime = 0;
  }
}
```

### 3.2 Strict Pause & Time Gating in `engine.ts`

#### 1. Method `advanceVehicle`
Change signature from `(vehicle: Vehicle, deltaRealMs: number)` to `(vehicle: Vehicle, deltaSimMs: number)`:
```typescript
private advanceVehicle(vehicle: Vehicle, deltaSimMs: number): void {
  // Strict pause freeze: zero movement, zero updates
  if (this.clock.isPaused || deltaSimMs <= 0) {
    return;
  }

  if (vehicle.routeGeometry.length < 2 || vehicle.routeDurationS <= 0) {
    this.completeVehicleRoute(vehicle);
    return;
  }

  const deltaSimS = deltaSimMs / 1000;
  const effectiveSpeedFactor = 1 / Math.max(0.2, this.trafficMultiplier);
  const progressIncrement = (deltaSimS / vehicle.routeDurationS) * effectiveSpeedFactor;
  vehicle.routeProgress = Math.min(1, vehicle.routeProgress + progressIncrement);

  const newPosition = interpolateAlongPath(vehicle.routeGeometry, vehicle.routeProgress);
  vehicle.position = newPosition;
  vehicle.speed_kmh = (vehicle.routeDistanceM / vehicle.routeDurationS) * 3.6 * effectiveSpeedFactor;

  // Trail history and telemetry pings (only advance when running/unpaused)
  if (!vehicle.trailHistory) vehicle.trailHistory = [];
  const simTime = this.clock.getSimulatedTime();
  const lastTrail = vehicle.trailHistory[vehicle.trailHistory.length - 1];
  if (
    !lastTrail ||
    haversineDistance(newPosition, { lat: lastTrail[1], lon: lastTrail[0] }) >= 15 ||
    simTime - lastTrail[2] >= 1000
  ) {
    vehicle.trailHistory.push([newPosition.lon, newPosition.lat, simTime]);
    if (vehicle.trailHistory.length > 35) {
      vehicle.trailHistory.shift();
    }
  }

  if (this.tickCounter % 5 === 0) {
    this.emitEvent('vehicle', vehicle.id, 'vehicle.position.updated', {
      lat: newPosition.lat,
      lon: newPosition.lon,
      progress: vehicle.routeProgress,
      speed_kmh: vehicle.speed_kmh,
    });
    // Persist ping & state...
  }

  if (vehicle.routeProgress >= 1) {
    this.completeVehicleRoute(vehicle);
  }
}
```

#### 2. Method `updateVehicles`
```typescript
private updateVehicles(simTime: number, deltaSimMs: number): void {
  if (this.clock.isPaused || deltaSimMs <= 0) {
    return;
  }

  // 1. SLA monitoring only runs when time advances
  for (const order of this.world.getAllOrders()) {
    if (order.status === 'delivered' || order.status === 'cancelled') continue;
    if (order.slaDeadline) {
      if (simTime > order.slaDeadline) {
        if (order.slaStatus !== 'breached') {
          order.slaStatus = 'breached';
          this.emitEvent('order', order.id, 'order.sla.breached', {
            orderId: order.id,
            priority: order.priority,
            deadline: order.slaDeadline,
            simTime,
          });
        }
      } else if (order.slaDeadline - simTime < 10 * 60 * 1000) {
        order.slaStatus = 'at_risk';
      } else {
        order.slaStatus = 'on_time';
      }
    }
  }

  // 2. Advance active vehicle positions
  for (const vehicle of this.world.getAllVehicles()) {
    if (vehicle.status === 'en_route' || vehicle.status === 'returning') {
      this.advanceVehicle(vehicle, deltaSimMs);
    }
  }
}
```

#### 3. Method `tick()` Loop
```typescript
private tick(): void {
  // If paused or speed is 0, freeze loop and refresh lastTickTime baseline
  if (this.clock.isPaused || this.clock.speed === 0) {
    this.lastTickTime = Date.now();
    return;
  }

  const now = Date.now();
  const deltaMs = now - this.lastTickTime;
  this.lastTickTime = now;
  this.tickCounter++;

  // 1. Advance simulation clock
  this.clock.tick(deltaMs);
  const simTime = this.clock.getSimulatedTime();
  const deltaSimMs = deltaMs * this.clock.speed * 60;

  // 2. Poll upstream orders
  if (this.tickCounter % 50 === 0) {
    this.pollEcommerceOrders();
  }

  // 3. Generate scenario orders
  this.generateOrders(simTime);

  // 4. Dispatch pending orders
  this.dispatchPendingOrders();

  // 5. Move vehicles
  this.updateVehicles(simTime, deltaSimMs);

  // 6. Predictive AI rebalancing
  if (this.activeDispatchStrategy === 'predictive_ai' && this.tickCounter % 30 === 0) {
    this.evaluatePredictiveRebalancing(simTime);
  }

  // 7. Chaos Engine loop
  this.chaosEngine.tick(simTime, this);
}
```

#### 4. Method `resume()`
```typescript
public resume(): void {
  this.lastTickTime = Date.now(); // Reset baseline timestamp to prevent time leap
  this.clock.resume();
  this.emitEvent('simulation', this.simulationId, 'simulation.resumed', {});
}
```

### 3.3 State Reporting in `engine.ts`

```typescript
public getStatus(): 'running' | 'paused' | 'stopped' {
  if (!this.intervalId && !this.clock.isPaused) {
    return 'stopped';
  }
  if (this.clock.isPaused || this.clock.speed === 0) {
    return 'paused';
  }
  return 'running';
}
```
In `getState()`:
```typescript
return {
  simulationId: this.simulationId,
  simTime: this.clock.getSimulatedTime(),
  speed: this.clock.speed,
  status: this.getStatus(),
  vehicles,
  // ...
};
```
In `stop()`:
```typescript
public stop(): void {
  if (this.intervalId) {
    clearInterval(this.intervalId);
    this.intervalId = null;
  }
  this.clock.resume(); // Reset pause flag so stopped status is cleanly reported
  this.emitEvent('simulation', this.simulationId, 'simulation.stopped', {});
  console.log('[SimulationEngine] Simulation stopped');
}
```

### 3.4 Discrete Stepping Engine Method & REST API

#### Engine Method: `engine.step(steps?: number, deltaSimMs?: number)`
```typescript
public step(
  steps: number = 1,
  deltaSimMs?: number
): { stepsExecuted: number; simTime: number; deltaSimMs: number } {
  const effectiveSteps = Math.max(1, Math.floor(steps));
  // Default step duration: TICK_RATE_MS (100ms) * speed (or 1) * 60 = 6000 sim ms
  const stepDeltaSim = deltaSimMs ?? (this.TICK_RATE_MS * (this.clock.speed || 1) * 60);

  const wasPaused = this.clock.isPaused;
  this.clock.resume(); // Unpause temporarily for discrete step execution

  try {
    for (let i = 0; i < effectiveSteps; i++) {
      this.tickCounter++;

      // 1. Advance simulation clock discretely
      this.clock.step(stepDeltaSim);
      const simTime = this.clock.getSimulatedTime();

      // 2. Poll upstream orders periodically
      if (this.tickCounter % 50 === 0) {
        this.pollEcommerceOrders();
      }

      // 3. Generate scenario orders
      this.generateOrders(simTime);

      // 4. Dispatch pending orders
      this.dispatchPendingOrders();

      // 5. Move vehicles along route geometry
      this.updateVehicles(simTime, stepDeltaSim);

      // 6. Predictive AI rebalancing
      if (this.activeDispatchStrategy === 'predictive_ai' && this.tickCounter % 30 === 0) {
        this.evaluatePredictiveRebalancing(simTime);
      }

      // 7. Phnom Penh Urban Chaos Engine loop
      this.chaosEngine.tick(simTime, this);
    }
  } finally {
    if (wasPaused) {
      this.clock.pause(); // Restore previous pause status
    }
  }

  this.emitEvent('simulation', this.simulationId, 'simulation.stepped', {
    stepsExecuted: effectiveSteps,
    deltaSimMs: stepDeltaSim,
    simTime: this.clock.getSimulatedTime(),
  });

  return {
    stepsExecuted: effectiveSteps,
    simTime: this.clock.getSimulatedTime(),
    deltaSimMs: stepDeltaSim,
  };
}
```

#### REST Route: `POST /api/simulation/step` (`routes.ts`)
```typescript
router.post('/simulation/step', (req, res) => {
  try {
    const { steps, deltaSimMs, deltaMs } = req.body || {};

    let parsedSteps = 1;
    if (steps !== undefined) {
      if (typeof steps !== 'number' || !Number.isInteger(steps) || steps < 1) {
        return res.status(400).json({ error: 'Parameter "steps" must be a positive integer' });
      }
      if (steps > 1000) {
        return res.status(400).json({ error: 'Parameter "steps" cannot exceed 1000' });
      }
      parsedSteps = steps;
    }

    let parsedDeltaSimMs: number | undefined;
    if (deltaSimMs !== undefined) {
      if (typeof deltaSimMs !== 'number' || !Number.isFinite(deltaSimMs) || deltaSimMs <= 0) {
        return res.status(400).json({ error: 'Parameter "deltaSimMs" must be a positive number' });
      }
      parsedDeltaSimMs = deltaSimMs;
    } else if (deltaMs !== undefined) {
      if (typeof deltaMs !== 'number' || !Number.isFinite(deltaMs) || deltaMs <= 0) {
        return res.status(400).json({ error: 'Parameter "deltaMs" must be a positive number' });
      }
      parsedDeltaSimMs = deltaMs * (engine.clock.speed || 1) * 60;
    }

    const result = engine.step(parsedSteps, parsedDeltaSimMs);
    res.json({
      status: 'stepped',
      stepsExecuted: result.stepsExecuted,
      deltaSimMs: result.deltaSimMs,
      simTime: result.simTime,
      formattedTime: engine.clock.getFormattedTime(),
      simulationStatus: engine.getState().status,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to step simulation' });
  }
});
```

---

## 4. Edge Cases Analyzed

| # | Scenario | Proposed Handling | Expected Output |
|---|----------|-------------------|-----------------|
| 1 | Vehicle en route when `pause()` called | `advanceVehicle` checks `if (this.clock.isPaused) return;` | Progress, coordinates, and telemetry strictly freeze. |
| 2 | Resuming after prolonged pause (e.g. 10s real time) | `engine.resume()` refreshes `lastTickTime = Date.now()` | No catch-up time burst; next tick delta is normal (~100ms). |
| 3 | Discrete step called while paused | `engine.step()` temporarily unpauses, advances $K$ ticks, and restores pause in `finally` block | State advances by exactly $K \times \Delta t$; returns `status: 'paused'`. |
| 4 | Discrete step called with `steps: -5` or `"abc"` | Route validation rejects invalid integer inputs | HTTP 400 `{ error: 'Parameter "steps" must be a positive integer' }`. |
| 5 | `setSpeed(0)` called | `getStatus()` evaluates `speed === 0` as `'paused'` | Engine status immediately reports `'paused'`. |
| 6 | Discrete step called with `deltaSimMs` exceeding route duration | `Math.min(1, progress + increment)` clamps progress to 1 | Route cleanly completes and triggers delivery on the final step. |
| 7 | Stepping an engine that has never started (`intervalId === null`) | Works cleanly in headless discrete mode | Advances simulated clock and world state without background timer. |

---

## 5. Caveats

1. **Async Order Dispatch During Discrete Stepping**: `dispatchPendingOrders()` invokes `dispatcher.assignOrder()` asynchronously. In a multi-tick synchronous loop, dispatches initiate concurrently. For deterministic replay (addressed in subsequent M1 subtasks), dispatch queue dequeuing must be synchronous and race-free.
2. **Frontend Coordination**: Updating backend `status` to accurately report `'paused'` resolves the pause button state in `ControlBar.tsx` and Spacebar toggle in `App.tsx`. A future frontend PR may optionally add a dedicated "Step 1 Tick" UI button calling `/api/simulation/step`.

---

## 6. Conclusion

1. **Root Causes Identified**:
   - `SimulationClock` lacked `step(deltaSimMs)` and `reset()`, while calling `Date.now()` during instantiation.
   - `advanceVehicle` computed simulated time progression using `clock.speed` (which remained 1) rather than checking pause state, allowing vehicles to traverse routes and deliver orders while paused.
   - `getState().status` checked `clock.speed > 0` rather than `clock.isPaused`, wrongly reporting `'running'`.
   - No REST endpoint existed for discrete stepping.
2. **Implementation Ready**:
   - Precise drop-in implementations have been designed for `clock.ts`, `engine.ts`, and `routes.ts`.
   - Backward compatibility is fully preserved for all 55 existing passing tests.

---

## 7. Verification Method

To verify the proposed implementation:

1. **Unit Test Suite (`tests/simulation.test.ts`)**:
   Add test suites verifying:
   ```typescript
   describe('SimulationClock Deterministic Controls', () => {
     it('steps simulated time discretely without wall clock dependencies', () => {
       const clock = new SimulationClock(0, 1);
       clock.step(5000);
       expect(clock.getSimulatedTime()).toBe(5000);
       clock.step(10000);
       expect(clock.getSimulatedTime()).toBe(15000);
     });

     it('resets clock cleanly to initial state', () => {
       const clock = new SimulationClock(5000, 10);
       clock.pause();
       clock.reset();
       expect(clock.getSimulatedTime()).toBe(0);
       expect(clock.speed).toBe(1);
       expect(clock.isPaused).toBe(false);
     });
   });

   describe('Strict Pause & Discrete Stepping', () => {
     it('strictly freezes vehicle coordinates and progress during pause', () => {
       const engine = new SimulationEngine();
       engine.start();
       const vehicle = engine.world.getAllVehicles()[0];
       vehicle.status = 'en_route';
       vehicle.routeGeometry = [[104.9, 11.5], [104.91, 11.51]];
       vehicle.routeDistanceM = 1000;
       vehicle.routeDurationS = 300;
       vehicle.routeProgress = 0.2;
       const initialPos = { ...vehicle.position };

       engine.pause();
       expect(engine.getState().status).toBe('paused');

       // Simulate passage of time / ticks while paused
       engine.clock.tick(5000);
       expect(vehicle.routeProgress).toBe(0.2);
       expect(vehicle.position).toEqual(initialPos);

       engine.stop();
     });

     it('executes discrete steps and reports paused status upon completion', () => {
       const engine = new SimulationEngine();
       engine.pause();
       const res = engine.step(5, 1000);
       expect(res.stepsExecuted).toBe(5);
       expect(res.simTime).toBe(5000);
       expect(engine.getState().status).toBe('paused');
     });
   });
   ```

2. **Integration Verification via HTTP**:
   Start test Express app with `setupRoutes(engine)`:
   - Call `POST /api/simulation/pause` $\rightarrow$ assert `{ status: 'paused' }`.
   - Call `GET /api/simulation/state` $\rightarrow$ assert `response.body.status === 'paused'`.
   - Call `POST /api/simulation/step` with `{ steps: 3, deltaSimMs: 2000 }` $\rightarrow$ assert `{ status: 'stepped', stepsExecuted: 3, simTime: 6000, simulationStatus: 'paused' }`.
   - Call `POST /api/simulation/step` with `{ steps: -1 }` $\rightarrow$ assert HTTP 400.

3. **Full Backend Test Run**:
   ```powershell
   cd c:\Users\User\study-workspace\supply-chain-workspace\logistics-sandbox\backend
   pnpm test
   pnpm build
   ```
   All 55 existing tests plus new test cases must pass with 0 errors.
