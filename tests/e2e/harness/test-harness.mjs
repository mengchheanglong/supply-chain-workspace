/**
 * @fileoverview E2E Test Harness and Assertion Utilities.
 * Provides assertion primitives, test runners, deterministic PRNG/crypto oracles,
 * and geodesic distance calculations without external dependencies.
 */

import crypto from 'node:crypto';

export class AssertionError extends Error {
  constructor(message, actual, expected) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
  }
}

export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new AssertionError(
      `${message ? message + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      actual,
      expected
    );
  }
}

export function assertNotEqual(actual, expected, message = '') {
  if (actual === expected) {
    throw new AssertionError(
      `${message ? message + ': ' : ''}Expected values to differ, but both were ${JSON.stringify(actual)}`,
      actual,
      expected
    );
  }
}

export function assertDeepEqual(actual, expected, message = '') {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new AssertionError(
      `${message ? message + ': ' : ''}Deep equality mismatch.\nExpected: ${expectedStr}\nActual:   ${actualStr}`,
      actual,
      expected
    );
  }
}

export function assertTrue(value, message = '') {
  if (value !== true) {
    throw new AssertionError(`${message ? message + ': ' : ''}Expected true, got ${value}`, value, true);
  }
}

export function assertFalse(value, message = '') {
  if (value !== false) {
    throw new AssertionError(`${message ? message + ': ' : ''}Expected false, got ${value}`, value, false);
  }
}

export function assertNull(value, message = '') {
  if (value !== null) {
    throw new AssertionError(`${message ? message + ': ' : ''}Expected null, got ${JSON.stringify(value)}`, value, null);
  }
}

export function assertNotNull(value, message = '') {
  if (value === null || value === undefined) {
    throw new AssertionError(`${message ? message + ': ' : ''}Expected non-null value, got ${value}`, value, 'non-null');
  }
}

export function assertGreaterThan(actual, expected, message = '') {
  if (!(actual > expected)) {
    throw new AssertionError(
      `${message ? message + ': ' : ''}Expected ${actual} > ${expected}`,
      actual,
      expected
    );
  }
}

export function assertLessThan(actual, expected, message = '') {
  if (!(actual < expected)) {
    throw new AssertionError(
      `${message ? message + ': ' : ''}Expected ${actual} < ${expected}`,
      actual,
      expected
    );
  }
}

export function assertInRange(actual, min, max, message = '') {
  if (actual < min || actual > max) {
    throw new AssertionError(
      `${message ? message + ': ' : ''}Expected ${actual} to be in range [${min}, ${max}]`,
      actual,
      `[${min}, ${max}]`
    );
  }
}

export function assertMatches(actual, regex, message = '') {
  if (!regex.test(String(actual))) {
    throw new AssertionError(
      `${message ? message + ': ' : ''}Expected ${JSON.stringify(actual)} to match regex ${regex}`,
      actual,
      regex.toString()
    );
  }
}

export async function assertThrows(fn, expectedPattern = null, message = '') {
  let threw = false;
  let thrownError = null;
  try {
    await fn();
  } catch (err) {
    threw = true;
    thrownError = err;
  }
  if (!threw) {
    throw new AssertionError(`${message ? message + ': ' : ''}Expected function to throw, but it succeeded`, null, 'Error');
  }
  if (expectedPattern && thrownError) {
    const errorMsg = thrownError.message || String(thrownError);
    if (typeof expectedPattern === 'string' && !errorMsg.includes(expectedPattern)) {
      throw new AssertionError(
        `${message ? message + ': ' : ''}Error message "${errorMsg}" did not contain "${expectedPattern}"`,
        errorMsg,
        expectedPattern
      );
    } else if (expectedPattern instanceof RegExp && !expectedPattern.test(errorMsg)) {
      throw new AssertionError(
        `${message ? message + ': ' : ''}Error message "${errorMsg}" did not match pattern ${expectedPattern}`,
        errorMsg,
        expectedPattern.toString()
      );
    }
  }
}

/**
 * Deterministic Mulberry32 32-bit Pseudo-Random Number Generator.
 * Used as the authoritative PRNG oracle matching logistics-sandbox.
 */
export class Mulberry32Oracle {
  constructor(seed) {
    this.initialSeed = seed;
    this.state = seed >>> 0;
  }

  reset() {
    this.state = this.initialSeed >>> 0;
  }

  nextFloat() {
    let z = (this.state += 0x6d2b79f5);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min, max) {
    return Math.floor(min + this.nextFloat() * (max - min + 1));
  }
}

/**
 * Canonical Event Serializer:
 * - Sorts object keys recursively.
 * - Strips volatile wall-clock metadata (realTimestamp, systemJitter).
 * - Formats floating-point numbers to fixed 6 decimals for coordinates.
 */
export function canonicalizeEvent(event) {
  const volatileKeys = new Set(['realTimestamp', 'wallClockMs', 'systemJitter', 'osTickDelta']);

  function cleanAndSort(obj) {
    if (obj === null || typeof obj !== 'object') {
      if (typeof obj === 'number') {
        return Number.isInteger(obj) ? obj : Math.round(obj * 1e6) / 1e6;
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(cleanAndSort);
    }
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
      if (!volatileKeys.has(key)) {
        sorted[key] = cleanAndSort(obj[key]);
      }
    }
    return sorted;
  }

  const sanitized = cleanAndSort(event);
  return JSON.stringify(sanitized);
}

/**
 * Computes SHA-256 over a sequence of canonical events.
 */
export function computeCanonicalEventSequenceHash(events) {
  const hasher = crypto.createHash('sha256');
  for (const event of events) {
    const canonicalStr = canonicalizeEvent(event);
    hasher.update(canonicalStr + '\n', 'utf8');
  }
  return hasher.digest('hex');
}

/**
 * Computes great-circle haversine distance in meters between two lat/lon points.
 * Serves as the mathematical lower bound for road routing distance.
 */
export function haversineDistanceMeters(coordA, coordB) {
  const R = 6371000; // Earth radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(coordB.lat - coordA.lat);
  const dLon = toRad(coordB.lon - coordA.lon);
  const lat1 = toRad(coordA.lat);
  const lat2 = toRad(coordB.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Lightweight Test Suite Collector and Runner.
 */
export class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run(reporter = console) {
    reporter.log(`\n======================================================`);
    reporter.log(`▶ Running Suite: ${this.name}`);
    reporter.log(`======================================================`);

    let passed = 0;
    let failed = 0;
    const failures = [];
    const startTime = Date.now();

    for (const t of this.tests) {
      const tStart = Date.now();
      try {
        await t.fn();
        const durationMs = Date.now() - tStart;
        reporter.log(`  ✓ [PASS] ${t.name} (${durationMs}ms)`);
        passed++;
      } catch (err) {
        const durationMs = Date.now() - tStart;
        reporter.log(`  ✗ [FAIL] ${t.name} (${durationMs}ms)`);
        reporter.log(`    Error: ${err.message}`);
        if (err.stack) {
          reporter.log(`    Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
        }
        failed++;
        failures.push({ name: t.name, error: err });
      }
    }

    const totalDuration = Date.now() - startTime;
    reporter.log(`------------------------------------------------------`);
    reporter.log(`Suite "${this.name}" Completed in ${totalDuration}ms:`);
    reporter.log(`  Total: ${this.tests.length} | Passed: ${passed} | Failed: ${failed}`);

    return {
      suiteName: this.name,
      total: this.tests.length,
      passed,
      failed,
      failures,
      durationMs: totalDuration,
    };
  }
}
