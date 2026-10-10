/**
 * @fileoverview Automated verification script for Platform Admin connectors and endpoints.
 * Validates connectivity from Platform Admin to:
 * - supply-chain-platform (Port 8100)
 * - osm-pathfinder (Port 8000)
 * - logistics-sandbox (Port 8500)
 * - fleet-route-optimizer (Port 8200)
 * - ecommerce-storefront (Port 8401)
 * - supply-chain-control-tower (Port 8300)
 */

const PLATFORM_TOKEN = '2rTa1EJWQC6EyeyhpIcsDf2rEpRPBLGAz7eFwCwRQQo';

async function testAdminConnections() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       CONTROL TOWER CROSS-ECOSYSTEM CONNECTIVITY SUITE             ║');
  console.log('║ control-tower -> supply-chain, osm, sandbox, optimizer, storefront ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Test platform-admin Vite UI on Port 8300
  console.log('▶ [CHECK 1/6] Standalone Platform Admin Control Plane (Port 8300)');
  try {
    const res = await fetch('http://127.0.0.1:8300/');
    assert(res.ok, `platform-admin responds HTTP ${res.status} on http://localhost:8300`);
    const text = await res.text();
    assert(text.includes('Supply Chain Control Tower') || text.includes('Platform Administration HQ') || text.includes('Ecosystem Control Plane'),
      'HTML title and meta tags verify Control Tower branding');
  } catch (err) {
    assert(false, `platform-admin failed to respond: ${err.message}`);
  }

  // 2. Test Supply Chain Platform API on Port 8100
  console.log('\n▶ [CHECK 2/6] Supply Chain Operations Platform (Port 8100)');
  try {
    const healthRes = await fetch('http://127.0.0.1:8100/api/health/ready');
    assert(healthRes.ok, `supply-chain-platform /api/health/ready responds 200 OK`);
    const healthJson = await healthRes.json();
    assert(healthJson.status === 'ready' && healthJson.checks.database === true, 'PostgreSQL 18 database check verified ready');

    // Facilities
    const facRes = await fetch('http://127.0.0.1:8100/api/v1/facilities', {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` }
    });
    assert(facRes.ok, 'Admin connector /api/v1/facilities responds 200 OK');
    const facJson = await facRes.json();
    assert(facJson.items?.length === 4, `Operational PostGIS facilities fetched: ${facJson.items?.length} facilities`);
    assert(facJson.items.some(f => f.code === 'DC-PNH-01'), 'Facility DC-PNH-01 (Phnom Penh) verified');

    // SKUs
    const skuRes = await fetch('http://127.0.0.1:8100/api/v1/skus', {
      headers: { Authorization: `Bearer ${PLATFORM_TOKEN}` }
    });
    assert(skuRes.ok, 'Admin connector /api/v1/skus responds 200 OK');
    const skuJson = await skuRes.json();
    assert(skuJson.items?.length === 4, `Operational catalog SKUs fetched: ${skuJson.items?.length} SKUs`);
  } catch (err) {
    assert(false, `supply-chain-platform connection failed: ${err.message}`);
  }

  // 3. Test OSM Pathfinder Daemon on Port 8000
  console.log('\n▶ [CHECK 3/6] OSM Pathfinder Physical Routing Daemon (Port 8000)');
  try {
    const statsRes = await fetch('http://127.0.0.1:8000/api/graph/stats');
    assert(statsRes.ok, 'osm-pathfinder /api/graph/stats responds 200 OK');
    const stats = await statsRes.json();
    assert(stats.nodes === 86 && stats.edges === 224, `Road graph topology verified (${stats.nodes} nodes, ${stats.edges} edges)`);

    // Live Route calculation via POST /api/route
    const routeRes = await fetch('http://127.0.0.1:8000/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_lat: 11.5564,
        start_lon: 104.9282,
        end_lat: 11.5720,
        end_lon: 104.9180,
        algorithm: 'astar',
        metric: 'time',
        profile: 'van'
      })
    });
    assert(routeRes.ok, 'Live route query executed on Port 8000 (POST /api/route)');
    const routeJson = await routeRes.json();
    assert(routeJson.path?.length > 0, `Route calculated with distance: ${Math.round(routeJson.distance_m || routeJson.distanceM)}m, duration: ${Math.round(routeJson.duration_s || routeJson.durationS)}s`);
  } catch (err) {
    assert(false, `osm-pathfinder connection failed: ${err.message}`);
  }

  // 4. Test Fleet Route Optimizer Solver on Port 8200
  console.log('\n▶ [CHECK 4/6] Fleet Route Optimizer VRPTW Solver (Port 8200)');
  try {
    const healthRes = await fetch('http://127.0.0.1:8200/api/health');
    assert(healthRes.ok, 'fleet-route-optimizer /api/health responds 200 OK');
    const healthJson = await healthRes.json();
    assert(healthJson.algorithms?.includes('MetaheuristicVrpOptimizer'), 'Metaheuristic ALNS VRPTW solver algorithm online');

    // Live compare run
    const compareRes = await fetch('http://127.0.0.1:8200/api/optimizer/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stopsCount: 12, fleetSize: 4 })
    });
    assert(compareRes.ok, 'Live solver comparison POST /api/optimizer/compare responds 200 OK');
    const compareJson = await compareRes.json();
    assert(typeof compareJson.comparison?.costSavingsPercent === 'number',
      `Solver cost savings percentage computed: ${compareJson.comparison?.costSavingsPercent}%`);
    assert(compareJson.optimizedResult?.routes?.length > 0,
      `Optimal tours returned: ${compareJson.optimizedResult?.routes?.length} routes`);
  } catch (err) {
    assert(false, `fleet-route-optimizer connection failed: ${err.message}`);
  }

  // 5. Test Logistics Sandbox Simulation on Port 8500
  console.log('\n▶ [CHECK 5/6] Logistics Digital-Twin Sandbox (Port 8500)');
  try {
    const healthRes = await fetch('http://127.0.0.1:8500/api/health');
    assert(healthRes.ok, 'logistics-sandbox /api/health responds 200 OK');

    const stateRes = await fetch('http://127.0.0.1:8500/api/simulation/state');
    assert(stateRes.ok, 'logistics-sandbox /api/simulation/state responds 200 OK');
    const stateJson = await stateRes.json();
    assert(stateJson.warehouses?.length > 0, `Simulation warehouses active: ${stateJson.warehouses?.length} depots`);
    assert(stateJson.ecommerceBridge?.accessMode === 'read-only', 'Operational isolation invariant (read-only) verified');
  } catch (err) {
    assert(false, `logistics-sandbox connection failed: ${err.message}`);
  }

  // 6. Test E-Commerce Storefront on Port 8401 & Admin Redirection
  console.log('\n▶ [CHECK 6/6] E-Commerce Storefront (Port 8401) & Admin Redirect');
  try {
    const webRes = await fetch('http://127.0.0.1:8401/');
    assert(webRes.ok, 'ecommerce-storefront responds HTTP 200 on http://localhost:8401');

    const adminRouteRes = await fetch('http://127.0.0.1:8401/admin');
    assert(adminRouteRes.ok, 'ecommerce-storefront /admin route responds 200 OK');
    const adminHtml = await adminRouteRes.text();
    assert(adminHtml.includes('Platform Admin') || adminHtml.includes('8300') || adminHtml.includes('Control Tower'),
      'E-commerce /admin successfully wires to Control Tower Port 8300');
  } catch (err) {
    assert(false, `ecommerce-storefront connection failed: ${err.message}`);
  }

  console.log('\n======================================================================');
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

testAdminConnections().catch((err) => {
  console.error('Test execution failed:', err);
  process.exitCode = 1;
});
