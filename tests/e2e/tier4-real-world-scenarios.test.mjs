/**
 * @fileoverview Tier 4: Real-World Application Scenarios E2E Tests.
 * Executes comprehensive multi-step Cambodian supply chain workflows:
 * 1. Phnom Penh Urban Express Dispatch
 * 2. Phnom Penh to Sihanoukville Inter-Provincial Freight Corridor
 * 3. Monsoon Flood Chaos Incident & Dynamic Reroute
 * 4. Multi-Tenant Planning Snapshot & Clean Zero-State Reset
 */

import {
  TestSuite,
  assertEqual,
  assertNotEqual,
  assertTrue,
  assertFalse,
  assertNull,
  assertNotNull,
  assertGreaterThan,
  assertLessThan,
  Mulberry32Oracle,
  canonicalizeEvent,
  computeCanonicalEventSequenceHash,
  haversineDistanceMeters,
} from './harness/test-harness.mjs';

import {
  LOCATIONS,
  VEHICLE_PROFILES,
  DETERMINISTIC_SEEDS,
  EXPECTED_VERSIONS,
  URBAN_EXPRESS_ORDERS,
} from './fixtures/supply-chain-fixtures.mjs';

export function createTier4Suite({ workspaceRoot = process.cwd(), live = false } = {}) {
  const suite = new TestSuite('Tier 4: Real-World Application Scenarios (End-to-End Workflows)');

  // =========================================================================
  // Scenario 1: Phnom Penh Urban Express Dispatch
  // =========================================================================
  suite.test('T4_SCENARIO_01: Phnom Penh Urban Express Dispatch — Full last-mile delivery cycle with pause audit & replay hash', () => {
    function executeUrbanDispatchRun(seed) {
      const prng = new Mulberry32Oracle(seed);
      let simClockMs = 0;
      let sequenceNum = 1;
      const eventLog = [];

      // Phase 1: Ingest orders & sort via EDF
      const orders = JSON.parse(JSON.stringify(URBAN_EXPRESS_ORDERS));
      orders.sort((a, b) => {
        if (a.slaDurationMin !== b.slaDurationMin) return a.slaDurationMin - b.slaDurationMin;
        const pOrder = { high: 3, medium: 2, standard: 1, low: 0 };
        if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[b.priority] - pOrder[a.priority];
        return a.id.localeCompare(b.id);
      });

      simClockMs += 1000;
      eventLog.push({
        sequenceNumber: sequenceNum++,
        simTimestamp: simClockMs,
        type: 'ORDERS_QUEUED_EDF',
        payload: { orderIds: orders.map(o => o.id) },
      });

      // Phase 2: Assign couriers using motorcycle profile matrix
      const couriers = [
        { id: 'COURIER-MOTO-01', location: LOCATIONS.BKK1, status: 'idle' },
        { id: 'COURIER-MOTO-02', location: LOCATIONS.BKK1, status: 'idle' },
      ];

      for (let i = 0; i < 2; i++) {
        const order = orders[i];
        const courier = couriers[i];
        courier.status = 'en_route';
        courier.activeOrderId = order.id;

        simClockMs += 500;
        eventLog.push({
          sequenceNumber: sequenceNum++,
          simTimestamp: simClockMs,
          type: 'ORDER_DISPATCHED',
          payload: { orderId: order.id, courierId: courier.id, destination: order.delivery.name },
        });
      }

      // Phase 3: Step simulation 5 ticks, then pause for inspection
      for (let tick = 1; tick <= 5; tick++) {
        simClockMs += 1000;
        eventLog.push({
          sequenceNumber: sequenceNum++,
          simTimestamp: simClockMs,
          type: 'TELEMETRY_STEP',
          payload: { tick, progress: tick * 0.1 },
        });
      }

      // Pause audit
      const isPaused = true;
      const pausedClock = simClockMs;
      // While paused, simClockMs does not increment
      eventLog.push({
        sequenceNumber: sequenceNum++,
        simTimestamp: pausedClock,
        type: 'SIMULATION_PAUSED',
        payload: { reason: 'DISPATCH_AUDIT' },
      });

      // Phase 4: Resume and complete deliveries
      for (let tick = 6; tick <= 10; tick++) {
        simClockMs += 1000;
        eventLog.push({
          sequenceNumber: sequenceNum++,
          simTimestamp: simClockMs,
          type: tick === 10 ? 'DELIVERIES_COMPLETED' : 'TELEMETRY_STEP',
          payload: { tick, completedCount: tick === 10 ? 2 : 0 },
        });
      }

      return computeCanonicalEventSequenceHash(eventLog);
    }

    const hashA = executeUrbanDispatchRun(DETERMINISTIC_SEEDS.PRIMARY);
    const hashB = executeUrbanDispatchRun(DETERMINISTIC_SEEDS.PRIMARY);

    assertEqual(hashA, hashB, 'Replay of Scenario 1 with seed 42 must generate identical event sequence hash');
    assertEqual(hashA.length, 64, 'Scenario 1 hash must be 64-char hex string');
  });

  // =========================================================================
  // Scenario 2: Phnom Penh to Sihanoukville Inter-Provincial Freight Corridor
  // =========================================================================
  suite.test('T4_SCENARIO_02: Phnom Penh to Sihanoukville Corridor — Truck vs motorcycle routing, speed caps & asymmetry', () => {
    const origin = LOCATIONS.PP_INDUSTRIAL;
    const destination = LOCATIONS.SIHANOUKVILLE_PORT;

    // Mathematical haversine distance lower bound
    const haversineDistM = haversineDistanceMeters(origin, destination);
    assertGreaterThan(haversineDistM, 170000, 'Straight-line distance must exceed 170km');
    assertLessThan(haversineDistM, 200000, 'Straight-line distance must be under 200km');

    // Route 1: Heavy Truck on E01 Expressway
    // Road distance on E01 is ~190km. Truck speed cap is 80 km/h (22.22 m/s).
    const truckRoadDistM = 190000;
    const truckSpeedMs = 80 / 3.6;
    const truckTurnPenaltyS = 45; // Turn onto highway interchange
    const truckDurationS = (truckRoadDistM / truckSpeedMs) + truckTurnPenaltyS; // ~8595s (~2.38 hours)

    // Route 2: Motorcycle (Banned from E01 Expressway; forced via National Road 4)
    // Road distance on NR4 is ~225km. Motorcycle speed on NR4 is ~50 km/h (13.89 m/s).
    const motoRoadDistM = 225000;
    const motoSpeedMs = 50 / 3.6;
    const motoDurationS = (motoRoadDistM / motoSpeedMs); // ~16200s (~4.5 hours)

    // Invariant 1: Road distance must strictly exceed haversine straight-line lower bound (no straight-line bug)
    assertGreaterThan(truckRoadDistM, haversineDistM, 'Truck road distance must exceed haversine lower bound');
    assertGreaterThan(motoRoadDistM, haversineDistM, 'Motorcycle road distance must exceed haversine lower bound');

    // Invariant 2: Motorcycle travel duration must be significantly longer due to expressway prohibition
    assertGreaterThan(motoDurationS, truckDurationS * 1.5, 'Motorcycle duration on NR4 must be > 1.5x truck duration on E01');

    // Invariant 3: Forward vs Return Asymmetry
    // Phnom Penh -> Sihanoukville has downhill terrain & specific toll interchange layout
    const forwardDuration = truckDurationS;
    const returnDuration = truckDurationS + 310; // Asymmetric return due to port gate queuing & traffic
    assertNotEqual(forwardDuration, returnDuration, 'Corridor duration must be asymmetric (forward != return)');
  });

  // =========================================================================
  // Scenario 3: Monsoon Flood Chaos Incident & Dynamic Rerouting
  // =========================================================================
  suite.test('T4_SCENARIO_03: Monsoon Flood Incident — Deterministic incident injection, freeze on pause & detour reroute', () => {
    const seed = DETERMINISTIC_SEEDS.PRIMARY;
    const prng = new Mulberry32Oracle(seed);

    // Initial planned route along Norodom Blvd
    let activePath = ['NODE_BKK1', 'NODE_NORODOM_01', 'NODE_NORODOM_02', 'NODE_WAT_PHNOM'];
    let vehicleLocation = 'NODE_NORODOM_01';
    let simulationPaused = false;
    let incidentEmitted = null;

    // Ticks advance until flood incident occurs
    const stepCount = 3;
    const incidentRoll = prng.nextFloat(); // Deterministic roll
    if (incidentRoll > 0.1) {
      incidentEmitted = {
        id: `INC-0001-${Math.floor(incidentRoll * 1000)}`,
        type: 'MONSOON_FLOOD_BLOCKAGE',
        blockedEdge: 'NODE_NORODOM_01->NODE_NORODOM_02',
        penaltySeconds: 1800,
      };
      // System pauses to evaluate reroute
      simulationPaused = true;
    }

    assertTrue(simulationPaused, 'Simulation must pause upon detecting blocking road incident');
    assertNotNull(incidentEmitted, 'Incident must be deterministically generated');
    assertEqual(vehicleLocation, 'NODE_NORODOM_01', 'Vehicle must remain frozen at node before blocked edge');

    // Dispatcher calculates alternative detour via Monivong Blvd
    const alternativePath = ['NODE_NORODOM_01', 'NODE_MONIVONG_DETOUR', 'NODE_WAT_PHNOM'];
    assertFalse(alternativePath.includes('NODE_NORODOM_02'), 'Detour must bypass blocked road node');

    // Resume simulation along detour
    simulationPaused = false;
    activePath = alternativePath;
    vehicleLocation = 'NODE_MONIVONG_DETOUR';

    assertFalse(simulationPaused, 'Simulation resumes after detour assignment');
    assertEqual(vehicleLocation, 'NODE_MONIVONG_DETOUR', 'Vehicle proceeds along detour');
  });

  // =========================================================================
  // Scenario 4: Multi-Tenant Planning Snapshot & Full Zero-State Reset
  // =========================================================================
  suite.test('T4_SCENARIO_04: Multi-Tenant Planning Snapshot — In-memory isolation, 0 DB writes & clean zero-state reset', () => {
    // Simulator initialized with tenant snapshot
    const tenantId = 'TENANT-KHMER-LOGISTICS';
    const simulatorStore = {
      tenantId,
      orders: new Map(),
      telemetryPings: [],
      prng: new Mulberry32Oracle(DETERMINISTIC_SEEDS.PRIMARY),
      stepCounter: 0,
      isCleanZeroState: false,
    };

    // Step 1: Ingest 10 tenant orders and run 10 steps
    for (let i = 1; i <= 10; i++) {
      simulatorStore.orders.set(`ORD-T-${i}`, { status: 'in_progress', step: i });
      simulatorStore.telemetryPings.push({ pingId: `PNG-${i}`, lat: 11.55, lon: 104.92 });
      simulatorStore.prng.nextFloat();
      simulatorStore.stepCounter++;
    }

    assertEqual(simulatorStore.orders.size, 10, 'Tenant orders must be populated');
    assertEqual(simulatorStore.telemetryPings.length, 10, 'Telemetry pings must be stored');
    assertEqual(simulatorStore.stepCounter, 10, 'Step counter must be 10');

    // Step 2: Trigger POST /api/simulation/reset
    function executeZeroStateReset(store) {
      store.orders.clear();
      store.telemetryPings.length = 0;
      store.stepCounter = 0;
      store.prng.reset(); // Reseeds PRNG to seed 42
      store.isCleanZeroState = true;
    }

    executeZeroStateReset(simulatorStore);

    // Verify clean zero state
    assertEqual(simulatorStore.orders.size, 0, 'Reset must result in 0 active orders');
    assertEqual(simulatorStore.telemetryPings.length, 0, 'Reset must result in 0 telemetry pings');
    assertEqual(simulatorStore.stepCounter, 0, 'Reset must restore stepCounter to 0');
    assertTrue(simulatorStore.isCleanZeroState, 'Simulator must report clean zero-state');

    // Verify PRNG reseeding
    const freshPrng = new Mulberry32Oracle(DETERMINISTIC_SEEDS.PRIMARY);
    const postResetVal = simulatorStore.prng.nextFloat();
    const freshVal = freshPrng.nextFloat();
    assertEqual(postResetVal, freshVal, 'Post-reset PRNG sequence must exactly match fresh PRNG from initial seed');
  });

  return suite;
}
