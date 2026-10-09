#!/usr/bin/env node
/**
 * @fileoverview Unified E2E Test Suite Runner for Supply Chain Workspace.
 * Orchestrates execution of Tiers 1–4 across P0-04, ROUTE-01, and ENV-02.
 * Supports both offline contract verification and live service integration.
 *
 * Usage:
 *   node tests/e2e/runner.mjs [--live] [--tier <1|2|3|4|all>] [--json]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTier1Suite } from './tier1-feature-coverage.test.mjs';
import { createTier2Suite } from './tier2-boundary-corner.test.mjs';
import { createTier3Suite } from './tier3-pairwise-combinations.test.mjs';
import { createTier4Suite } from './tier4-real-world-scenarios.test.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../..');

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const jsonOutput = args.includes('--json');

  let selectedTier = 'all';
  const tierIdx = args.indexOf('--tier');
  if (tierIdx !== -1 && args[tierIdx + 1]) {
    selectedTier = args[tierIdx + 1].toLowerCase();
  }

  if (!jsonOutput) {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║        SUPPLY CHAIN WORKSPACE — DUAL-TRACK E2E TEST RUNNER         ║');
    console.log('║   Scope: P0-04 (Determinism), ROUTE-01 (Matrix), ENV-02 (Compose)  ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log(`Execution Mode : ${live ? 'LIVE INTEGRATION (Active Services)' : 'OFFLINE / CONTRACT VERIFICATION'}`);
    console.log(`Workspace Root : ${workspaceRoot}`);
    console.log(`Tier Filter    : ${selectedTier.toUpperCase()}`);
  }

  const suites = [];
  if (selectedTier === 'all' || selectedTier === '1') {
    suites.push(createTier1Suite({ workspaceRoot, live }));
  }
  if (selectedTier === 'all' || selectedTier === '2') {
    suites.push(createTier2Suite({ workspaceRoot, live }));
  }
  if (selectedTier === 'all' || selectedTier === '3') {
    suites.push(createTier3Suite({ workspaceRoot, live }));
  }
  if (selectedTier === 'all' || selectedTier === '4') {
    suites.push(createTier4Suite({ workspaceRoot, live }));
  }

  const overallStart = Date.now();
  const suiteResults = [];
  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;

  for (const suite of suites) {
    const result = await suite.run(jsonOutput ? { log: () => {} } : console);
    suiteResults.push(result);
    grandTotal += result.total;
    grandPassed += result.passed;
    grandFailed += result.failed;
  }

  const overallDuration = Date.now() - overallStart;

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          mode: live ? 'live' : 'offline',
          total: grandTotal,
          passed: grandPassed,
          failed: grandFailed,
          durationMs: overallDuration,
          suites: suiteResults,
        },
        null,
        2
      )
    );
  } else {
    console.log('\n======================================================================');
    console.log('                       E2E TEST SUMMARY REPORT                        ');
    console.log('======================================================================');
    for (const r of suiteResults) {
      const statusIcon = r.failed === 0 ? '✓' : '✗';
      console.log(
        `  ${statusIcon} ${r.suiteName.padEnd(52)} | ${String(r.passed).padStart(2)}/${String(r.total).padStart(2)} PASS (${r.durationMs}ms)`
      );
    }
    console.log('----------------------------------------------------------------------');
    console.log(
      `GRAND TOTAL: ${grandPassed}/${grandTotal} Passed | ${grandFailed} Failed | Duration: ${overallDuration}ms`
    );
    console.log('======================================================================\n');
  }

  if (grandFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal runner execution error:', err);
  process.exit(1);
});
