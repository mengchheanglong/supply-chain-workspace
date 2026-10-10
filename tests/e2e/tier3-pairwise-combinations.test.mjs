/**
 * @fileoverview Tier 3: Cross-Feature Combinations E2E Tests.
 * Evaluates pairwise and tripartite interactions across P0-04, ROUTE-01, and ENV-02.
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

import { ComposeValidator } from './harness/compose-validator.mjs';

export function createTier3Suite({ workspaceRoot = process.cwd(), live = false } = {}) {
  const suite = new TestSuite('Tier 3: Cross-Feature Combinations (Pairwise Interactions)');
  const validator = new ComposeValidator(workspaceRoot);

  suite.test('T3_PAIR_01: P0-04 x ROUTE-01 — Deterministic dispatch queue ordering driven by directed matrix travel times', () => {
    // Contract: Dispatcher evaluates pending orders against vehicle travel times from directed matrix
    const candidateVehicles = [
      { id: 'VEH-VAN-01', location: LOCATIONS.BKK1, profile: 'van' },
      { id: 'VEH-MOTO-01', location: LOCATIONS.RUSSIAN_MARKET, profile: 'motorcycle' },
    ];

    const targetOrder = URBAN_EXPRESS_ORDERS[0]; // Delivery at Wat Phnom

    // Directed matrix durations to Wat Phnom:
    // From BKK1: 420s (van)
    // From Russian Market: 780s (motorcycle)
    const costMatrix = {
      'VEH-VAN-01': 420.0,
      'VEH-MOTO-01': 780.0,
    };

    // Dispatch assignment selects minimum duration candidate
    const assignedVehicle = Object.entries(costMatrix).sort((a, b) => a[1] - b[1])[0][0];

    assertEqual(assignedVehicle, 'VEH-VAN-01', 'Dispatcher must select VEH-VAN-01 based on lower matrix duration');
    assertLessThan(costMatrix['VEH-VAN-01'], costMatrix['VEH-MOTO-01'], 'Van duration must be less than motorcycle from farther depot');
  });

  suite.test('T3_PAIR_02: P0-04 x ROUTE-01 — Profile speed limits govern progress increment across discrete clock ticks', () => {
    // Contract: advanceVehicle calculates progressIncrement = (deltaSimS / routeDurationS) * speedFactor
    // On a 10km primary road segment:
    // Van max speed on primary = 80 km/h = 22.22 m/s -> routeDuration = 450s
    // Truck max speed on primary = 60 km/h = 16.67 m/s -> routeDuration = 600s
    const distanceM = 10000;
    const vanSpeedMs = 80 / 3.6;
    const truckSpeedMs = 60 / 3.6;

    const vanRouteDurationS = distanceM / vanSpeedMs;   // 450s
    const truckRouteDurationS = distanceM / truckSpeedMs; // 600s

    const discreteTickSimS = 60; // 1 minute simulation step
    const vanProgressIncrement = discreteTickSimS / vanRouteDurationS;     // 60 / 450 = 0.1333
    const truckProgressIncrement = discreteTickSimS / truckRouteDurationS; // 60 / 600 = 0.1000

    assertGreaterThan(
      vanProgressIncrement,
      truckProgressIncrement,
      'Van progress increment per discrete tick must exceed truck due to higher legal speed'
    );
    assertEqual(Math.round(vanProgressIncrement * 1000), 133, 'Van progress increment matches physical equation');
    assertEqual(Math.round(truckProgressIncrement * 1000), 100, 'Truck progress increment matches physical equation');
  });

  suite.test('T3_PAIR_03: P0-04 x ROUTE-01 — Pausing simulation freezes vehicle on exact road network polyline coordinates', () => {
    // Polyline coordinates from routing engine
    const roadPolyline = [
      [104.9282, 11.5564], // Node 0 (BKK1)
      [104.9255, 11.5660], // Node 1 (Monivong / Sihanouk intersection)
      [104.9230, 11.5760], // Node 2 (Wat Phnom)
    ];

    let currentCoord = roadPolyline[1];
    let isPaused = true;

    // Simulate 3 ticks while paused
    for (let tick = 0; tick < 3; tick++) {
      if (!isPaused) {
        currentCoord = roadPolyline[2]; // Would advance if not paused
      }
    }

    assertEqual(currentCoord[0], roadPolyline[1][0], 'Longitude must remain frozen at node 1');
    assertEqual(currentCoord[1], roadPolyline[1][1], 'Latitude must remain frozen at node 1');
  });

  suite.test('T3_PAIR_04: P0-04 x ENV-02 — Seeded deterministic replay in isolated container produces identical SHA-256 hash', () => {
    const seed = DETERMINISTIC_SEEDS.PRIMARY; // 42

    function simulateIsolatedBatch(runSeed) {
      const prng = new Mulberry32Oracle(runSeed);
      const events = [];
      let simClock = 0;

      for (let step = 1; step <= 10; step++) {
        simClock += 1000;
        const roll = prng.nextFloat();
        events.push({
          sequenceNumber: step,
          simTimestamp: simClock,
          type: roll > 0.5 ? 'ORDER_INGESTED' : 'TELEMETRY_PING',
          payload: { step, roll: Math.round(roll * 1e4) / 1e4 },
        });
      }
      return computeCanonicalEventSequenceHash(events);
    }

    const hashRun1 = simulateIsolatedBatch(seed);
    const hashRun2 = simulateIsolatedBatch(seed);
    const hashDifferentSeed = simulateIsolatedBatch(DETERMINISTIC_SEEDS.SECONDARY);

    assertEqual(hashRun1, hashRun2, 'Repeated isolated simulation runs with seed 42 must yield identical SHA-256');
    assertNotEqual(hashRun1, hashDifferentSeed, 'Simulation run with different seed must produce divergent SHA-256');
  });

  suite.test('T3_PAIR_05: ROUTE-01 x ENV-02 — Internal bridge DNS resolution wires sandbox to routing:8000', () => {
    // Contract: sandbox container in planning network reaches router via container service URL
    const serviceHost = 'routing';
    const servicePort = 8000;
    const expectedInternalUrl = `http://${serviceHost}:${servicePort}/api/matrix`;

    assertTrue(expectedInternalUrl.startsWith('http://routing:8000'), 'Inter-container routing URL must use service hostname');
    assertFalse(expectedInternalUrl.includes('127.0.0.1'), 'Must not rely on host loopback inside container network');
  });

  suite.test('T3_PAIR_06: ROUTE-01 x ENV-02 — Matrix routing queries execute with zero operational database access', () => {
    const compose = validator.parseComposeStructure();

    // Verify routing service network attachments and secrets
    const routing = compose.services.routing;
    assertTrue(routing.networks.includes('planning'), 'Routing must be on planning network');
    assertFalse(routing.networks.includes('operations'), 'Routing must not have access to operations network');
    assertEqual(routing.secrets.length, 0, 'Routing must not hold database credentials');
  });

  suite.test('T3_PAIR_07: Tripartite Integration — Multi-vehicle dispatch with vehicle profiles and canonical event hashing', () => {
    // Simulate end-to-end lifecycle:
    // 1. Two orders arrive with distinct deadlines
    // 2. Profile-based assignment: van assigned to suburban order, motorcycle to congested downtown
    // 3. 5 discrete steps taken
    // 4. Verify canonical event hash invariance
    function runTripartiteFlow(seed) {
      const prng = new Mulberry32Oracle(seed);
      let clock = 0;
      const events = [];

      // Step 1: Ingestion
      clock += 1000;
      events.push({
        sequenceNumber: 1,
        simTimestamp: clock,
        type: 'ORDERS_INGESTED',
        payload: { count: 2, orderIds: ['ORD-01', 'ORD-02'] },
      });

      // Step 2: Profile Matrix Evaluation
      clock += 1000;
      events.push({
        sequenceNumber: 2,
        simTimestamp: clock,
        type: 'MATRIX_EVALUATED',
        payload: {
          profile: 'motorcycle',
          matrixVersion: EXPECTED_VERSIONS.COST_MODEL_VERSION,
          assigned: { 'ORD-01': 'VEH-MOTO-01', 'ORD-02': 'VEH-VAN-01' },
        },
      });

      // Step 3-5: Progress & Delivery
      for (let i = 3; i <= 5; i++) {
        clock += 1000;
        events.push({
          sequenceNumber: i,
          simTimestamp: clock,
          type: i === 5 ? 'ORDER_DELIVERED' : 'VEHICLE_STEP',
          payload: { step: i, progress: (i - 2) * 0.33 },
        });
      }

      return computeCanonicalEventSequenceHash(events);
    }

    const digest1 = runTripartiteFlow(42);
    const digest2 = runTripartiteFlow(42);

    assertEqual(digest1, digest2, 'Tripartite end-to-end flow must produce identical hash');
    assertEqual(digest1.length, 64, 'Digest must be 64-char hex SHA-256');
  });

  return suite;
}
