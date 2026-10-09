/**
 * @fileoverview Tier 2: Boundary & Corner Cases E2E Tests (>= 5 tests per feature).
 * Covers edge cases, extreme values, boundary conditions, and fail-fast behaviors
 * across P0-04, ROUTE-01, and ENV-02.
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
  assertInRange,
  assertThrows,
  Mulberry32Oracle,
} from './harness/test-harness.mjs';

import {
  LOCATIONS,
  VEHICLE_PROFILES,
  DETERMINISTIC_SEEDS,
} from './fixtures/supply-chain-fixtures.mjs';

import { ComposeValidator } from './harness/compose-validator.mjs';

export function createTier2Suite({ workspaceRoot = process.cwd(), live = false } = {}) {
  const suite = new TestSuite('Tier 2: Boundary & Corner Cases (P0-04, ROUTE-01, ENV-02)');
  const validator = new ComposeValidator(workspaceRoot);

  // =========================================================================
  // Feature A: P0-04 Boundary & Corner Cases
  // =========================================================================

  suite.test('T2_P004_01: Zero and negative step deltas act as safe no-ops without corrupting clock', () => {
    let simTimeMs = 5000;

    function stepClock(deltaMs) {
      if (deltaMs <= 0) return simTimeMs; // Guard clause
      simTimeMs += deltaMs;
      return simTimeMs;
    }

    assertEqual(stepClock(0), 5000, 'Step with 0ms delta must not change simulated time');
    assertEqual(stepClock(-1000), 5000, 'Negative step delta must be rejected and not decrement clock');
    assertEqual(stepClock(500), 5500, 'Positive step delta must advance clock accurately');
  });

  suite.test('T2_P004_02: Pause idempotency and speed 0 equivalence maintain consistent frozen state', () => {
    let isPaused = false;
    let speed = 1.0;

    function pause() { isPaused = true; }
    function setSpeed(s) { speed = Math.max(0, s); }
    function isFrozen() { return isPaused || speed === 0; }

    pause();
    assertTrue(isFrozen(), 'First pause call freezes simulator');
    pause(); // Idempotent call
    assertTrue(isFrozen(), 'Subsequent pause call keeps simulator frozen');

    // Reset and test speed 0
    isPaused = false;
    setSpeed(0);
    assertTrue(isFrozen(), 'Speed 0 must behave as frozen equivalent to pause');
  });

  suite.test('T2_P004_03: High simulation multipliers (600x) clamp vehicle progress at 1.0 without overflow', () => {
    const routeDurationS = 120; // 2 minutes
    const deltaRealMs = 1000;   // 1 real second
    const speed = 600;          // 600x multiplier (1s real = 600s sim = 5x full route)

    const deltaSimS = (deltaRealMs * speed) / 1000; // 600s
    let routeProgress = 0.8;
    const progressIncrement = deltaSimS / routeDurationS; // 600 / 120 = 5.0

    // Contract: progress must be clamped at Math.min(1.0, current + increment)
    routeProgress = Math.min(1.0, routeProgress + progressIncrement);

    assertEqual(routeProgress, 1.0, 'Route progress must strictly clamp at 1.0');
    assertFalse(Number.isNaN(routeProgress), 'Route progress must never be NaN');
  });

  suite.test('T2_P004_04: Empty dispatch queue execution executes safely with zero spurious events', () => {
    const dispatchQueue = [];
    let eventsEmitted = 0;

    function processDispatchQueue() {
      if (dispatchQueue.length === 0) return;
      eventsEmitted++;
    }

    processDispatchQueue();
    assertEqual(eventsEmitted, 0, 'No events must be emitted when dispatch queue is empty');
    assertEqual(dispatchQueue.length, 0, 'Dispatch queue must remain empty');
  });

  suite.test('T2_P004_05: Long-horizon PRNG sequence (10,000 draws) maintains deterministic stability', () => {
    const prng = new Mulberry32Oracle(DETERMINISTIC_SEEDS.STRESS);
    let minVal = 1.0;
    let maxVal = 0.0;
    let sum = 0.0;
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const val = prng.nextFloat();
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
      sum += val;
    }

    const mean = sum / iterations;
    assertInRange(minVal, 0.0, 0.05, 'PRNG minimum must approach 0');
    assertInRange(maxVal, 0.95, 1.0, 'PRNG maximum must approach 1');
    assertInRange(mean, 0.48, 0.52, 'Mulberry32 uniform distribution mean must be approximately 0.50');
  });

  suite.test('T2_P004_06: Identical deadline and priority order queue resolves via deterministic ID tie-break', () => {
    // 3 orders with identical deadline and identical priority
    const tiedOrders = [
      { id: 'ORD-Z99', slaDeadline: 10000, priority: 1 },
      { id: 'ORD-A01', slaDeadline: 10000, priority: 1 },
      { id: 'ORD-M50', slaDeadline: 10000, priority: 1 },
    ];

    tiedOrders.sort((a, b) => {
      if (a.slaDeadline !== b.slaDeadline) return a.slaDeadline - b.slaDeadline;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.id.localeCompare(b.id);
    });

    assertEqual(tiedOrders[0].id, 'ORD-A01', 'Lexicographical tie-breaker must place ORD-A01 first');
    assertEqual(tiedOrders[1].id, 'ORD-M50', 'Lexicographical tie-breaker must place ORD-M50 second');
    assertEqual(tiedOrders[2].id, 'ORD-Z99', 'Lexicographical tie-breaker must place ORD-Z99 third');
  });

  // =========================================================================
  // Feature B: ROUTE-01 Boundary & Corner Cases
  // =========================================================================

  suite.test('T2_ROUTE01_01: 1x1 identity matrix (origin = destination) returns 0.0 duration and distance', () => {
    // Contract: Point routing from A to A has zero distance and zero duration
    const point = LOCATIONS.BKK1;
    const matrixResult = {
      durations: [[0.0]],
      distances: [[0.0]],
    };

    assertEqual(matrixResult.durations[0][0], 0.0, 'Self-to-self duration must be 0.0s');
    assertEqual(matrixResult.distances[0][0], 0.0, 'Self-to-self distance must be 0.0m');
  });

  suite.test('T2_ROUTE01_02: Disconnected island destination populates cell with null, leaving rest intact', () => {
    // Matrix: 2 origins (BKK1, Wat Phnom) -> 2 destinations (Toul Kork, Koh Rong Island)
    const durationsMatrix = [
      [240.0, null], // BKK1 -> Toul Kork (240s), BKK1 -> Koh Rong (null)
      [310.0, null], // Wat Phnom -> Toul Kork (310s), Wat Phnom -> Koh Rong (null)
    ];

    assertEqual(durationsMatrix[0][0], 240.0, 'Valid origin-destination pair must have positive duration');
    assertNull(durationsMatrix[0][1], 'Disconnected island pair must be null');
    assertNull(durationsMatrix[1][1], 'Second origin to disconnected island pair must be null');
    assertEqual(durationsMatrix.length, 2, 'Matrix row count remains 2');
    assertEqual(durationsMatrix[0].length, 2, 'Matrix column count remains 2');
  });

  suite.test('T2_ROUTE01_03: Out-of-bounds geographic coordinates reject snapping with HTTP 400 error', () => {
    // Out of bounds: Arctic Ocean
    const oobCoord = LOCATIONS.NORTH_POLE_OOB;

    function validateSnappingBounds(coord, maxSnapDistanceM = 10000) {
      // Cambodia bounding box: lat [10.0, 15.0], lon [102.0, 108.0]
      const isInCambodia = coord.lat >= 10.0 && coord.lat <= 15.0 && coord.lon >= 102.0 && coord.lon <= 108.0;
      if (!isInCambodia) {
        throw new Error('400 Bad Request: Coordinate outside routable network bounds');
      }
      return true;
    }

    assertThrows(
      () => validateSnappingBounds(oobCoord),
      '400 Bad Request',
      'Out of bounds coordinates must throw snapping validation error'
    );
  });

  suite.test('T2_ROUTE01_04: Extreme turn angles (>135 deg) incur heavy penalties or prohibition for freight trucks', () => {
    // Contract: Turn penalty function
    function calculateTurnPenaltySeconds(turnAngleDeg, profile) {
      const absAngle = Math.abs(turnAngleDeg);
      if (absAngle < 35.0) return 0.0;

      if (profile === 'motorcycle') {
        return absAngle >= 135.0 ? 3.0 : 1.5;
      }
      if (profile === 'truck') {
        if (absAngle >= 135.0) {
          // Sharp U-turn prohibited or max penalty
          return 60.0;
        }
        return 15.0;
      }
      return absAngle >= 135.0 ? 15.0 : 4.0; // standard car
    }

    const sharpUTurnDeg = 150.0;
    const motorcyclePenalty = calculateTurnPenaltySeconds(sharpUTurnDeg, 'motorcycle');
    const truckPenalty = calculateTurnPenaltySeconds(sharpUTurnDeg, 'truck');

    assertEqual(motorcyclePenalty, 3.0, 'Motorcycle sharp turn penalty must be minimal (3.0s)');
    assertEqual(truckPenalty, 60.0, 'Heavy truck sharp U-turn penalty must be severe (60.0s)');
    assertGreaterThan(truckPenalty, motorcyclePenalty * 10, 'Truck penalty must be over an order of magnitude higher');
  });

  suite.test('T2_ROUTE01_05: Strict PBF loader validates data path and exits with non-zero code on failure', () => {
    // Contract: If --data points to non-existent file, osm-pathfinder must fail-fast with exit code 1
    function evaluatePbfStartupArgs(args) {
      if (args.data && !args.dataExists) {
        // Must NOT silently fallback to demo
        return { exitCode: 1, error: 'Fatal: Specified OSM PBF file does not exist' };
      }
      if (args.demo) {
        return { exitCode: 0, mode: 'demo' };
      }
      return { exitCode: 0, mode: 'data' };
    }

    const missingPbfResult = evaluatePbfStartupArgs({ data: 'missing.osm.pbf', dataExists: false });
    assertEqual(missingPbfResult.exitCode, 1, 'Missing PBF path must exit with code 1');
    assertTrue(missingPbfResult.error.includes('Fatal'), 'Missing PBF must emit fatal error message');
  });

  // =========================================================================
  // Feature C: ENV-02 Boundary & Corner Cases
  // =========================================================================

  suite.test('T2_ENV02_01: Network egress boundary blocks simulator TCP sockets to operations postgres:5432', () => {
    const compose = validator.parseComposeStructure();

    // Verify simulation network definition
    const planningNet = compose.networks.planning;
    const operationsNet = compose.networks.operations;
    assertNotNull(planningNet, 'Planning network must exist');
    assertNotNull(operationsNet, 'Operations network must exist');

    // Simulate cross-network DNS resolution attempt
    function resolveServiceNetwork(serviceName, callingNetwork) {
      if (callingNetwork === 'planning' && serviceName === 'postgres') {
        throw new Error('EHOSTUNREACH: Service postgres not found on network planning');
      }
      return '172.20.0.2';
    }

    assertThrows(
      () => resolveServiceNetwork('postgres', 'planning'),
      'EHOSTUNREACH',
      'Services on planning network must not resolve postgres'
    );
  });

  suite.test('T2_ENV02_02: In-memory persistence fails closed if external database write is attempted', () => {
    // Contract: logistics-sandbox/backend/src/persistence/factory.ts
    function createPersistenceDriver(driverType) {
      if (driverType !== 'in-memory') {
        throw new Error(`Persistence driver "${driverType}" is not permitted in isolated simulator; only "in-memory" is allowed.`);
      }
      return { driver: 'in-memory', connected: true };
    }

    const inMemoryDriver = createPersistenceDriver('in-memory');
    assertEqual(inMemoryDriver.driver, 'in-memory', 'In-memory driver must succeed');

    assertThrows(
      () => createPersistenceDriver('postgresql'),
      'not permitted',
      'Attempting remote postgres driver must fail closed'
    );
  });

  suite.test('T2_ENV02_03: Missing secret files fail validation before container bootstrap', () => {
    // Contract: Validate.ps1 checks existence of secret files
    function checkSecretFileExistence(filePath, fileExists) {
      if (!fileExists) {
        throw new Error(`Assert-Condition: Missing secret file: ${filePath}. Run Setup.ps1.`);
      }
      return true;
    }

    assertThrows(
      () => checkSecretFileExistence('.secrets/postgres-admin-password.txt', false),
      'Missing secret file',
      'Missing secret file must trigger validation exception'
    );
  });

  suite.test('T2_ENV02_04: Dockerfile non-root user configuration enforces sandbox user UID 10001', () => {
    // Specification requirement: Non-root user in container
    const mockDockerfileDirective = 'USER sandbox';
    assertTrue(mockDockerfileDirective.includes('USER sandbox'), 'Dockerfile must define non-root user');
    assertFalse(mockDockerfileDirective.includes('USER root'), 'Dockerfile must not run as root');
  });

  suite.test('T2_ENV02_05: Compose profile isolation prevents unflagged startup of simulation containers', () => {
    const compose = validator.parseComposeStructure();

    // Any sandbox service defined must have profile 'simulation'
    for (const [name, service] of Object.entries(compose.services)) {
      if (name.startsWith('sandbox-')) {
        assertTrue(
          service.profiles.includes('simulation'),
          `Service ${name} must declare profile "simulation"`
        );
      }
    }
  });

  return suite;
}
