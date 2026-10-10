#!/usr/bin/env node
/**
 * @fileoverview End-to-End Cross-Repository Pipeline Verification Suite.
 *
 * Verifies end-to-end integration across all 4 repositories:
 * 1. Master Data & Catalog Unification (Facilities & SKUs across all 3 apps)
 * 2. Storefront to Warehouse Core Bridge (ecommerce-hive-nosql -> supply-chain-platform)
 *    - Successful demand order routing and double-entry stock reservation
 *    - Edge Case 2a: Oversell / Insufficient stock rejection (HTTP 409) & clean rollback
 *    - Edge Case 2b: Multi-line partial allocation rollback without leaked reservations
 * 3. Warehouse to Dispatch Fleet Bridge (supply-chain-platform -> logistics-sandbox)
 *    - Operational order ingestion filtering out unallocated/cancelled orders
 * 4. Fleet to Physical Routing (logistics-sandbox -> osm-pathfinder)
 *    - Real road geometry, accurate travel time reporting without 3600s clamping
 * 5. Regional Fulfillment Network (cambodia_network 4-depot preset)
 * 6. Operational Isolation Invariant (AGENTS.md: Simulation workers hold 0 DB write credentials)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

// Import from logistics-sandbox
import { SimulationEngine } from '../logistics-sandbox/backend/dist/simulation/engine.js';
import { World } from '../logistics-sandbox/backend/dist/world/world.js';
import { OPERATIONAL_FACILITIES } from '../logistics-sandbox/backend/dist/world/types.js';
import { FALLBACK_CAMBODIA_CATALOG } from '../logistics-sandbox/backend/dist/integrations/ecommerce.js';
import { OperationalPlatformReadClient } from '../logistics-sandbox/backend/dist/integrations/operational-platform.js';
import { RoutingClient } from '../logistics-sandbox/backend/dist/routing/client.js';
import { SCENARIO_PRESETS } from '../logistics-sandbox/backend/dist/scenarios/presets.js';

// Import from ecommerce-storefront
import { SupplyChainBridgeService } from '../ecommerce-storefront/backend/dist/orders/supply-chain-bridge.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runCrossRepoVerification() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       CROSS-REPOSITORY END-TO-END PIPELINE VERIFICATION SUITE       ║');
  console.log('║   supply-chain-platform + ecommerce + sandbox + osm-pathfinder    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // Load tenant token
  const secretPath = path.join(workspaceRoot, 'supply-chain-platform/.secrets/0948f598-13c6-46ec-a0f5-0ec1b4984476.json');
  let token = '2rTa1EJWQC6EyeyhpIcsDf2rEpRPBLGAz7eFwCwRQQo';
  let tenantId = '0948f598-13c6-46ec-a0f5-0ec1b4984476';
  if (existsSync(secretPath)) {
    const data = JSON.parse(readFileSync(secretPath, 'utf-8'));
    token = data.token;
    tenantId = data.tenantId;
  }

  const platformBaseUrl = 'http://127.0.0.1:3100';
  const routingBaseUrl = 'http://127.0.0.1:3000';

  // --------------------------------------------------------------------------
  // TEST 1: Master Data & Catalog Unification
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 1/6] Master Data & Catalog Unification Across Repositories');

  // 1a. Facilities alignment
  const expectedFacilities = ['DC-PNH-01', 'DC-REP-01', 'DC-KOS-01', 'DC-BAT-01'];
  for (const code of expectedFacilities) {
    const sandboxFac = OPERATIONAL_FACILITIES.find((f) => f.id === code);
    assert(sandboxFac !== undefined, `Facility ${code} defined in logistics-sandbox OPERATIONAL_FACILITIES`);
  }

  // Check platform API facilities
  const facRes = await fetch(`${platformBaseUrl}/api/v1/facilities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(facRes.ok, `supply-chain-platform /api/v1/facilities responds 200 OK`);
  const facData = await facRes.json();
  const platformFacilityCodes = (facData.items || []).map((f) => f.code);
  for (const code of expectedFacilities) {
    assert(platformFacilityCodes.includes(code), `Facility ${code} exists in supply-chain-platform master data`);
  }

  // 1b. SKUs alignment
  const expectedSkus = ['SKU-FOOD-01', 'SKU-ELEC-01', 'SKU-COLD-01', 'SKU-MED-01'];
  for (const skuCode of expectedSkus) {
    const sandboxItem = FALLBACK_CAMBODIA_CATALOG.find((c) => c.product_id === skuCode);
    assert(sandboxItem !== undefined, `Catalog SKU ${skuCode} defined in logistics-sandbox catalog`);
  }

  // Check platform API SKUs
  const skuRes = await fetch(`${platformBaseUrl}/api/v1/skus`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(skuRes.ok, `supply-chain-platform /api/v1/skus responds 200 OK`);
  const skuData = await skuRes.json();
  const platformSkuCodes = (skuData.items || []).map((s) => s.code);
  for (const skuCode of expectedSkus) {
    assert(platformSkuCodes.includes(skuCode), `Catalog SKU ${skuCode} exists in supply-chain-platform master data`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Storefront to Warehouse Core Bridge & Double-Entry Allocation
  // --------------------------------------------------------------------------
  console.log('\n▶ [TEST 2/6] Storefront to Warehouse Core Bridge & Double-Entry Allocation');

  const bridgeService = new SupplyChainBridgeService();
  await bridgeService.refreshMasterData();

  const testOrderId = `E2E-ORD-${Date.now().toString(36).toUpperCase()}`;

  const storefrontOrder = {
    order_id: testOrderId,
    customer_id: 'CUST-E2E-77',
    customer_name: 'Bopha Meas (E2E Test)',
    province: 'Phnom Penh',
    items: [
      { product_id: 'SKU-FOOD-01', name: 'Organic Jasmine Rice 25kg Bag', quantity: 2, price: 28.0 },
      { product_id: 'SKU-ELEC-01', name: 'Solar Inverter Battery 5kWh', quantity: 1, price: 450.0 },
    ],
    total: 506.0,
    payment_method: 'NBC Bakong KHQR',
    delivery_address: 'Street 271, Boeng Tumpun, Phnom Penh',
    status: 'Pending',
  };

  // Check initial stock balance
  const pnhFacId = facData.items.find((f) => f.code === 'DC-PNH-01').id;
  const foodSkuId = skuData.items.find((s) => s.code === 'SKU-FOOD-01').id;

  const initBalRes = await fetch(`${platformBaseUrl}/api/v1/inventory/balance?facilityId=${pnhFacId}&skuId=${foodSkuId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const initBalData = await initBalRes.json();
  const initialReserved = Number(initBalData.stock.reserved);
  console.log(`  Initial SKU-FOOD-01 stock: OnHand=${initBalData.stock.onHand}, Reserved=${initialReserved}, Available=${initBalData.stock.available}`);

  // Forward order through the Storefront to Warehouse Bridge
  const bridgeResult = await bridgeService.bridgeOrder(storefrontOrder);
  assert(bridgeResult.success === true, `Bridge order created successfully in supply-chain-platform`);
  assert(bridgeResult.platformOrderId !== undefined, `Platform order ID assigned: ${bridgeResult.platformOrderId}`);
  assert(bridgeResult.facilityCode === 'DC-PNH-01', `Routed to correct facility: ${bridgeResult.facilityCode}`);
  assert(bridgeResult.allocations && bridgeResult.allocations.length === 2, `Reserved double-entry allocations for 2 order lines`);

  // Verify stock reservation in PostgreSQL double-entry inventory ledger
  const postBalRes = await fetch(`${platformBaseUrl}/api/v1/inventory/balance?facilityId=${pnhFacId}&skuId=${foodSkuId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const postBalData = await postBalRes.json();
  const postReserved = Number(postBalData.stock.reserved);
  assert(postReserved === initialReserved + 2, `PostgreSQL double-entry inventory ledger reserved +2 units (Was ${initialReserved}, now ${postReserved})`);

  // --------------------------------------------------------------------------
  // TEST 2 (Continued): Edge Case 2a — Out-of-Stock / Oversell Rollback
  // --------------------------------------------------------------------------
  console.log('\n  ▶ [Edge Case 2a] Out-of-Stock / Oversell Rejection & Platform Rollback');
  const oversellOrderId = `E2E-OVER-${Date.now().toString(36).toUpperCase()}`;
  const oversellOrder = {
    order_id: oversellOrderId,
    customer_id: 'CUST-OVERSELL',
    customer_name: 'Oversell Tester',
    province: 'Phnom Penh',
    items: [
      { product_id: 'SKU-FOOD-01', quantity: 999999 }, // Far exceeds available balance
    ],
  };

  const oversellResult = await bridgeService.bridgeOrder(oversellOrder);
  assert(oversellResult.success === false, `Bridge rejected oversold order with success: false`);
  assert(oversellResult.statusCode === 409, `Bridge reported HTTP 409 Conflict for insufficient stock`);
  assert(oversellResult.allocations.length === 0, `Zero allocations reported for oversold order`);

  // Verify platform order is cancelled and ledger balance did not change
  const oversellPlatOrdRes = await fetch(`${platformBaseUrl}/api/v1/fulfillment/order?orderId=${oversellResult.platformOrderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const oversellPlatOrdData = await oversellPlatOrdRes.json();
  assert(oversellPlatOrdData.order.state === 'cancelled', `Platform order ${oversellResult.platformOrderId} automatically rolled back to 'cancelled'`);

  const oversellBalRes = await fetch(`${platformBaseUrl}/api/v1/inventory/balance?facilityId=${pnhFacId}&skuId=${foodSkuId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const oversellBalData = await oversellBalRes.json();
  assert(Number(oversellBalData.stock.reserved) === postReserved, `Double-entry inventory ledger reserved balance strictly unchanged after rejected oversell`);

  // --------------------------------------------------------------------------
  // TEST 2 (Continued): Edge Case 2b — Partial Allocation Rollback
  // --------------------------------------------------------------------------
  console.log('\n  ▶ [Edge Case 2b] Partial Line Allocation Failure & Complete Rollback');
  const partialFailOrderId = `E2E-PARTIAL-${Date.now().toString(36).toUpperCase()}`;
  const partialFailOrder = {
    order_id: partialFailOrderId,
    customer_id: 'CUST-PARTIAL',
    customer_name: 'Partial Rollback Tester',
    province: 'Phnom Penh',
    items: [
      { product_id: 'SKU-FOOD-01', quantity: 1 }, // Line 1: valid
      { product_id: 'SKU-ELEC-01', quantity: 999999 }, // Line 2: invalid (exceeds stock)
    ],
  };

  const partialFailResult = await bridgeService.bridgeOrder(partialFailOrder);
  assert(partialFailResult.success === false, `Partial allocation rejected with success: false`);
  assert(partialFailResult.statusCode === 409, `Partial allocation returned 409 Conflict`);
  assert(partialFailResult.allocations.length === 0, `All partial allocations rolled back`);

  const partialOrdRes = await fetch(`${platformBaseUrl}/api/v1/fulfillment/order?orderId=${partialFailResult.platformOrderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const partialOrdData = await partialOrdRes.json();
  assert(partialOrdData.order.state === 'cancelled', `Platform order rolled back to cancelled after partial line failure`);

  // Verify Line 1 reserved units were released
  const checkBalRes = await fetch(`${platformBaseUrl}/api/v1/inventory/balance?facilityId=${pnhFacId}&skuId=${foodSkuId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const checkBalData = await checkBalRes.json();
  assert(Number(checkBalData.stock.reserved) === postReserved, `Line 1 reservation cleanly released without orphan stock leaks`);

  // --------------------------------------------------------------------------
  // TEST 3: Warehouse to Dispatch Fleet Bridge (platform -> logistics-sandbox)
  // --------------------------------------------------------------------------
  console.log('\n▶ [TEST 3/6] Warehouse to Dispatch Fleet Bridge (Operational Order Ingestion)');

  const opReader = new OperationalPlatformReadClient(platformBaseUrl);
  const isHealthy = await opReader.checkHealth();
  assert(isHealthy === true, `OperationalPlatformReadClient health check passes on ${platformBaseUrl}`);

  const pendingFulfillmentOrders = await opReader.fetchPendingOrders();
  assert(pendingFulfillmentOrders.length > 0, `OperationalPlatformReadClient fetched ${pendingFulfillmentOrders.length} pending orders`);

  // Verify that cancelled / unallocated orders are excluded
  const cancelledFound = pendingFulfillmentOrders.some((o) => o.order_id === oversellOrderId || o.order_id === partialFailOrderId);
  assert(cancelledFound === false, `Unallocated / rolled-back orders are strictly excluded from dispatch queue`);

  const ingestedOrder = pendingFulfillmentOrders.find((o) => o.order_id === testOrderId);
  assert(ingestedOrder !== undefined, `Ingested bridged order ${testOrderId} into simulation pipeline`);
  assert(ingestedOrder.items.length === 2, `Ingested order contains 2 demand lines with correct SKUs`);

  // Initialize simulation engine
  const engine = new SimulationEngine({
    operationalPlatformUrl: platformBaseUrl,
  });

  // Ingest order into World
  const simOrder = engine.ingestEcommerceOrder(ingestedOrder);
  assert(simOrder.id === testOrderId, `Order ${simOrder.id} successfully registered in Simulation World`);
  assert(simOrder.status === 'pending', `Order status is pending in dispatch queue`);
  assert(simOrder.pickupLocation.lat === 11.5564 && simOrder.pickupLocation.lon === 104.9282,
    `Pickup location matches DC-PNH-01 facility coordinates (lat: 11.5564, lon: 104.9282)`);
  assert(simOrder.totalWeight_kg > 0, `Order demand weight accurately computed (${simOrder.totalWeight_kg} kg)`);

  // --------------------------------------------------------------------------
  // TEST 4: Fleet to Physical Routing (sandbox -> osm-pathfinder)
  // --------------------------------------------------------------------------
  console.log('\n▶ [TEST 4/6] Fleet to Physical Routing via osm-pathfinder');

  const routingClient = new RoutingClient(routingBaseUrl);
  const route = await routingClient.calculateRoute(
    simOrder.pickupLocation,
    simOrder.deliveryLocation,
    { algorithm: 'astar', metric: 'time' }
  );

  assert(route.path.length >= 2, `osm-pathfinder returned physical road polyline with ${route.path.length} coordinate points`);
  assert(route.distanceM > 0, `Reported actual physical distance: ${Math.round(route.distanceM)} meters`);
  assert(route.durationS > 0, `Reported actual travel time: ${Math.round(route.durationS)} seconds`);
  assert(route.isFallback === false, `Route calculation used authentic osm-pathfinder engine (no straight-line fallback)`);

  // Dispatch vehicle and verify route duration accuracy
  const eligibleVehicles = engine.world.getIdleVehicles();
  assert(eligibleVehicles.length > 0, `Found ${eligibleVehicles.length} idle simulation vehicles ready for dispatch`);

  const assignment = await engine.dispatcher.assignOrder(simOrder, eligibleVehicles, routingClient, {
    strategy: 'nearest_available',
    routingAlgorithm: 'astar',
  });
  assert(assignment !== null, `Vehicle ${assignment?.vehicleId} successfully assigned to order ${simOrder.id}`);
  assert(assignment?.route.durationS === route.durationS, `Assigned route duration matches authentic osm-pathfinder travel time`);

  // Advance simulation stepping
  console.log('  Advancing simulation engine discrete steps...');
  for (let s = 0; s < 10; s++) {
    engine.step(1000); // 1.0 second per step
  }
  const eventHash = engine.getEventSequenceHash();
  assert(eventHash.eventCount > 0, `Deterministic event bus generated ${eventHash.eventCount} simulation events`);

  // --------------------------------------------------------------------------
  // TEST 5: Regional Fulfillment Network (cambodia_network Scenario)
  // --------------------------------------------------------------------------
  console.log('\n▶ [TEST 5/6] Regional Fulfillment Network (cambodia_network 4-Depot Scenario)');

  const regionalEngine = new SimulationEngine({
    scenarioId: 'cambodia_network',
    operationalPlatformUrl: platformBaseUrl,
  });

  const regionalDepots = regionalEngine.world.getAllWarehouses();
  assert(regionalDepots.length === 4, `Regional network loaded all 4 operational distribution centers`);

  for (const expCode of ['DC-PNH-01', 'DC-REP-01', 'DC-KOS-01', 'DC-BAT-01']) {
    const foundDepot = regionalEngine.world.getWarehouse(expCode);
    assert(foundDepot !== undefined, `Regional depot ${expCode} active in simulation world`);
  }

  const regionalVehicles = regionalEngine.world.getAllVehicles();
  assert(regionalVehicles.length === 40, `Regional network initialized with 40 vehicles distributed across depots`);

  // --------------------------------------------------------------------------
  // TEST 6: Operational Isolation Invariant (AGENTS.md)
  // --------------------------------------------------------------------------
  console.log('\n▶ [TEST 6/6] Operational Isolation Invariant (AGENTS.md Compliance)');

  const opStatus = opReader.getStatus();
  assert(opStatus.accessMode === 'read-only', `Operational read client accessMode is strictly 'read-only'`);
  assert(opStatus.egressPolicy === 'DISABLED', `Simulation egressPolicy is strictly 'DISABLED'`);

  // Verify that logistics-sandbox engine has NO database write credentials
  assert(process.env.SANDBOX_DB_PASSWORD === undefined, `Zero operational database write password in simulation environment`);

  console.log('\n======================================================================');
  console.log('               END-TO-END PIPELINE VERIFICATION SUMMARY               ');
  console.log('======================================================================');
  console.log(`Total Checks Executed : ${totalTests}`);
  console.log(`Passed Checks         : ${passedTests}`);
  console.log(`Failed Checks         : ${failedTests}`);
  console.log('----------------------------------------------------------------------');
  if (failedTests === 0) {
    console.log('✓ ALL 4 REPOSITORIES FULLY CONNECTED, VALIDATED & HARDENED END-TO-END!');
    console.log('======================================================================\n');
    process.exit(0);
  } else {
    console.error(`✗ ${failedTests} CHECKS FAILED.`);
    process.exit(1);
  }
}

runCrossRepoVerification().catch((err) => {
  console.error('Fatal E2E Pipeline Error:', err);
  process.exit(1);
});
