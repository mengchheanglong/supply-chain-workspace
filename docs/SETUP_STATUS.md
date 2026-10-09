# Setup evidence — 2026-10-08

## Prepared by this setup

- Independently versioned orchestration workspace and supply-chain-platform foundation.
- Working instructions, source-plan archive, ownership/port registry, reconciled architecture,
  prioritized backlog, platform domain/reuse decisions and implementation gates.
- Local PostGIS configuration, operations/planning database separation, dedicated application
  and read-only roles, ignored file secrets, named volume and health check.
- Optional routing Dockerfile/profile and explicit demo/real-PBF configurations.
- Idempotent setup, validation, diagnostics, dependency repair and service-management scripts.
- CI configuration validation; actual CI execution requires remote publication and is unverified.

## Verification during setup

Verified locally:

- Setup preserves existing .env and all credential files on repeat invocation.
- Base and real-OSM-overlay Compose parse; service paths, registry ports, loopback bindings,
  separate networks, credential mounts, PowerShell syntax and root Git exclusions pass.
- Docker Desktop was started; PostGIS image pulled, bootstrap completed and service is healthy.
- Host development access works at 127.0.0.1:5433. Separate bridge networks are used because
  this Docker engine did not publish host ports for the original internal-network configuration.
- Verify-Database.ps1 passes: application roles cannot connect to the other database;
  snapshot_reader can SELECT app-owned tables but cannot INSERT/UPDATE/DELETE/create tables;
  planning PostGIS exists. The table/data probe is rolled back.
- Routing Linux image built with locked Rust dependencies; container is healthy at
  http://127.0.0.1:3000. Health/stats and an A* distance route succeeded (14 path points).
  Dataset is explicitly the 86-node / 224-edge demo, not real OSM coverage validation.
- Existing JS dependency junctions were repaired with frozen offline installs. One existing
  lockfile importer declaration was aligned from ^3.7.0 to manifest ^3.0.1 for tailwind-merge;
  resolved version remains 3.7.0. No application logic was changed.
- TypeScript no-emit checks pass for sandbox frontend, commerce backend and commerce web.
- Sandbox backend typecheck reports five pre-existing errors: two private emitEvent accesses,
  an extra state return field, optional slaDeadline mutation, and missing PredictiveAiMetrics.
- Root/platform Git are initialized on main. Existing commerce/router source remains clean;
  sandbox has only the lockfile declaration change. Foundation files are uncommitted for review.

CI is configured but has not run remotely. Legacy behavior tests were not run during setup
because some use live HTTP/persistence calls. Earlier Rust test evidence is listed below.
pnpm reported ignored dependency build scripts; they were not globally enabled. Typechecks
are not a claim that every legacy production build or feature works.

## ENV-01 / P0-01 implementation evidence

The setup observations above are historical baselines. Subsequent local implementation:

- Fixed all five sandbox backend compilation errors: chaos event access, scenario return
  type, absent SLA deadline handling and missing predictive metrics type import.
- Engine marketplace access is a read-only interface. Local repositories own simulation
  results. Removed Mongo/Cassandra/Neo4j HTTP write adapters and credential defaults.
- Remote/unknown persistence settings reject startup. Marketplace credential/query/fragment
  URLs are rejected, reads omit credentials, and redirects are rejected.
- Removed order mirroring, upstream delivery updates and GPS uploads. Inventory adjustment
  and raw remote Cypher API routes return 403. Imported items/catalog/order copies are independent.
- UI labels show disabled upstream writes and local graph storage; injected orders report
  no marketplace synchronization.
- Backend and frontend no-emit TypeScript checks pass. Backend Vitest: **9 files / 50 tests pass**.
- Isolation regression: exactly 24 simulated hours, 500 imported deliveries persisted locally,
  populated local telemetry; mutable mock upstream orders, stock and GPS unchanged;
  no upstream mutation requests or write credentials sent.
- Additional tests cover operator injection/single-order delivery, read analytics, forbidden
  write endpoints and remote-driver/credential URL rejection.
- Existing tests still exercise live demo routing/fallbacks. The isolation regression uses
  router contract fixtures and fake wall time. Passing tests do not establish routing validity.
- Confirmed a pre-existing async single-order dispatch race: imports prepend queue entries
  before a dispatch callback shifts the head. Multi-stop dispatch is selected before imports
  in the 500-order isolation fixture. Queue ordering/reset/replay fixes belong to P0-04.
- Workspace/sandbox changes remain uncommitted. Commerce/router source untouched;
  previous tailwind-merge lockfile declaration repair preserved.

This is an application capability boundary, not a deployed network firewall. No simulator
container was connected to operations, no immutable snapshots implemented, and no demo sink
or approved exporter enabled. ENV-02 and DATA-02 remain pending.

## P0-02 inventory lifecycle evidence

- New marketplace checkout reserves stock; shipment consumes that reservation; delivery
  makes no additional stock change; cancellation before shipment releases it once.
- Product counters, order/reservation state and versioned inventory events use one MongoDB
  snapshot/majority transaction. Unique product/order/ledger indexes prevent duplicate identities.
- Stable order IDs plus normalized payload fingerprints make checkout retries idempotent.
  Concurrent status retries perform one stock movement; conflicting terminal transitions reject.
- Quantities are validated and duplicate SKU lines aggregated. USD monetary authority uses
  safe integer cents. Unknown items, shortage and ledger write failures abort the entire transaction.
- Remote database failure cannot create successful in-memory fallback mutations. The browser
  reports unconfirmed order/status/catalog writes as failures and retains checkout IDs for unchanged retries.
- Catalog updates cannot bypass inventory counters, reserved products cannot be deleted,
  and the unscoped stock-adjustment endpoint is disabled.
- Legacy orders are not guessed/migrated automatically; stock-changing transitions return
  reconciliation conflicts. Shipped cancellations require a future returns/receiving workflow.
- **19 tests pass**: real MongoDB transaction/concurrency/rollback cases, real Nest HTTP
  requests, offline behavior and browser API failure handling. Backend build and web no-emit
  TypeScript check pass. The tests use disposable replica sets and unique databases; no
  pre-existing marketplace data, volumes or container settings were changed.
- Opt-in compose.inventory.yaml supplies local replica-set initialization. Compose config
  validates, but the overlay has not been applied to the existing marketplace MongoDB.
  The original standalone database cannot accept transactional checkout.
- See ecommerce-hive-nosql/docs/inventory-reservations.md for counter definitions, retry
  rules, legacy reconciliation, configuration and repeatable test commands.

These are reference-marketplace corrections, not the new platform's operational schema,
authentication, tenant enforcement, payment verification or production readiness. Commerce
changes remain uncommitted; earlier workspace/sandbox work is preserved.

## P0-03 telemetry source evidence

- Selected the fixture-labelled acceptance path: marketplace GET /api/riders identifies
  fixture source, v1/demo scope, units, absent observation time and non-durable storage.
  Returned counts are actual fixture counts; throughput/volume/TTL are null. The service
  no longer polls or mixes sandbox vehicles into fixture rows.
- Marketplace GPS ingestion returns HTTP 503 with stored/success false. Neither HTTP
  retries nor compatibility web calls can create another sink or a fake acknowledgement.
  Fake CQL logs, manual ping buttons and Cassandra-online/throughput claims were removed
  from active fleet, tracking and health UI surfaces. Design schemas remain lab examples.
- Sandbox engine owns simulated ping writes. Its capacity-bounded repository copies
  records, deduplicates concurrent retained retries, rejects conflicting payloads and
  acknowledges only volatile storage. Identity indexes evict with history. Write failures
  produce telemetry.storage.failed events. Playback/history APIs expose source/run/units
  and query only the current run; exports preserve simulated lineage.
- **55 sandbox tests and 10 marketplace tests pass**, including real local HTTP reads/
  rejection responses, unchanged fixture state under rejected writes, concurrent retry,
  conflict, eviction, record-copy, zero-value, run-isolation and web outage-contract cases.
  Sandbox backend/frontend and marketplace web no-emit checks plus backend build pass.
- Agent-browser QA against the real fixture-only Nest controller and Next dev UI verified
  seven labelled fixtures, city filtering to three Phnom Penh rows and unavailable/empty
  roster behavior. Preview services are temporary; no existing data or containers changed.
- See docs/contracts/telemetry-v1.md for contracts, ownership and retained-history retry
  limits. No Cassandra connection, observed device GPS or durable/restart persistence
  was introduced. P0-04 determinism and ENV-02 deployment egress remain pending.

## Marketplace retirement and OPS-01 implementation

- Final e-commerce maintenance is pushed to origin/main as
  7a5ba5388a4d218bd6ad42e400280a104e364131. The repository is clean. Twenty-three
  isolated MongoDB/HTTP/unit/web tests and the web typecheck pass. It remains an
  e-commerce reference; no warehouse conversion or operational database link exists.
- Main development moved to supply-chain-platform. Nest 11.2.7, React 19.3.0, Vite
  8.3.3, TypeScript 5.9.3, native pg 8.23.1 and pnpm 10.32.1 are pinned with a lockfile.
- OPS-01 provides API/UI, facility/SKU source identities and units, scoped credential
  authentication/roles, PostGIS points, forced tenant row policies and transactional
  creation audits. CLI provisioning hashes access tokens and saves their generated
  credential artifact only in the ignored local secret directory.
- The app-owned initial migration is applied to the local operational database as
  operations_app. Repeat migration succeeds; checksums reject drift. Credential/
  tenant/audit metadata is excluded from snapshot-reader default grants.
- **Ten tests pass** against a disposable loopback-only PostGIS container with a
  non-superuser app role. Evidence includes reader/invalid/revoked-key rejection,
  cross-tenant input/SQL isolation, concurrent tenant reads, source uniqueness,
  precision/timezone/coordinate validation, audit rollback, CLI provisioning,
  repeated migrations/drift and offline readiness/write refusal. Test containers
  and generated test credentials are cleaned up; tests mount no existing volumes.
- Build, all typechecks and a frozen install pass. Browser QA shows local database
  readiness and rejects invalid credentials. API/Web are running on 127.0.0.1:3100/
  3101; no sample tenants, stock balances or operator credentials are seeded there.
- Platform source remains local and uncommitted; no platform remote was created.
  Full OIDC/user lifecycle, inventory, shipments, exports/snapshots and production
  deployment remain pending. ARCH-01 now precedes OPS-02 as recorded below.

## Architecture decision before further building

- Reviewed the current platform code, workspace/domain ownership and framework primary
  documentation. Adopted platform ADR-0003 and docs/ARCHITECTURE.md: Nest/Fastify modular
  operations, PostgreSQL/PostGIS/native pg, React/Vite with routes/queries, backend-only
  domain package, generated OpenAPI/client and independent operational job workers.
- Documented module responsibilities, package/import directions, transaction/tenant rules,
  durable outbox/job adoption, global database connection budgets and measured scaling.
- Added ARCH-01 ahead of OPS-02 with concrete regression, contract, pagination, session,
  import-boundary and performance-evidence gates.
- This turn changes design/working documents only. The current Express runtime, API/UI
  source, dependencies and applied migration are unchanged. No benchmark, production
  scalability, new worker/queue or architecture-alignment implementation is claimed.

## ARCH-01 — implemented and verified locally (2026-10-09)

- Aligned supply-chain-platform with ADR-0003: Nest/Fastify, backend-only operations
  domain/application package, thin feature transports, generated v1 OpenAPI wire types/
  typed client, lazy web routes, session-scoped queries and bounded cursor pagination.
- Frozen install and pnpm verify pass: builds/typechecks, contract freshness, import gate,
  two boundary tests and six frontend tests. Twelve disposable configuration/HTTP/PostGIS
  tests pass, including OPS-01 regressions and pagination/Fastify coverage. Applied migration
  001 remains unchanged; a read-only main database probe reports all readiness checks true.
- Real disposable browser QA verified create/reject flows, pagination, tenant switching,
  failed refresh/write and recovery. No main database fixtures were seeded. Temporary
  QA services, credential artifact and uniquely named test containers were cleaned up.
- The reproducible local master-data load run completed 900 requests with zero errors.
  At concurrency 32, p95 was 91.61 ms; this does not establish stock-contention or production
  capacity. See [full evidence and limits](../supply-chain-platform/docs/ARCHITECTURE_VERIFICATION.md).
- Parent Validate.ps1 passes. CI is configured locally and has not run remotely. No push,
  remote creation, inventory, worker/queue or planning connection is claimed.
- Next main-project slice is OPS-02 inventory ledger/reservations. Preserve these checks
  while adding transaction-safe idempotency, stock conservation and concurrent-command evidence.

## OPS-02 — inventory implemented and verified locally (2026-10-09)

- Added exact decimal-string stock commands, movement ledger, balances, reservations and
  tenant-scoped idempotent receive/reserve/release/ship results. History, balance, audit and
  result commit together; shared database locks coordinate two API instances.
- Migration 002 is applied in the local main database and repeated successfully. Migration
  001 remains checksum-verified. Readiness verifies both migrations, PostGIS and the restricted
  local role. No operational tenants or stock fixtures were seeded in main.
- Frozen install, builds/typechecks, contract freshness and import checks pass. Twenty API/
  PostGIS tests (eight inventory), eight frontend tests and two boundary tests pass.
- Disposable browser workflows verify receiving, reservation consumption/release, shortage
  rejection, unavailable refresh hiding stock and identical-command retry after recovery.
  QA services/credential artifact and disposable database containers were cleaned up.
- The final two-instance contention baseline checks 420 measured reserve/ship/replay requests:
  150 successful reservations, 90 expected shortage rejections and 180 shipment/replay responses.
  Each phase ends at zero on-hand/reserved with 51 physical movements and consistent history;
  the other tenant stays unchanged. No unexpected errors; this is not a production SLO.
- [Command policy](../supply-chain-platform/docs/INVENTORY.md) and
  [verification evidence](../supply-chain-platform/docs/INVENTORY_VERIFICATION.md) record scope,
  exact units, retry rules and remaining deployment/identity/recovery gates.
- Next main-project slice is OPS-03 fulfillment/shipment workflows. No remote repository,
  push, production deployment, marketplace feature change or planning write path was introduced.

## OPS-03 — fulfillment implemented and verified locally (2026-10-09)

- Added tenant-scoped demand/lines, exact partial allocation batches, picking/packing and
  draft/dispatch/cancel/observed-delivery shipment commands through separate owning modules.
  Managed reservations reject standalone inventory consumption/release. Parent/child stock,
  demand, workflow state, audit and retry receipts commit or roll back together.
- 29 API/config/PostGIS tests (nine workflow scenarios), 11 frontend and two boundary tests
  pass. Frozen install, builds/typechecks, generated contract freshness and import enforcement pass. Tests
  cover two-instance demand/stock contention, normalized/concurrent retries, dispatch/cancel
  races, invalid evidence/transitions, tenant/reader/cursor rejection and late audit rollback.
- Real disposable browser flow received 10, dispatched/delivered 4 and allocated/cancelled 2;
  final stock 6 on-hand/available, 0 reserved and one −4 dispatch movement reconciled.
  Unavailable dispatch retained the identical command and recovered once after readiness
  restoration. No browser JS errors. QA processes/container/credential artifact were removed.
- Migration 003 is applied and repeated locally; 001/002 checksums are preserved. Readiness
  checks database/PostGIS/three migrations/restrictedRole all true. No main fixtures seeded.
  Parent Validate.ps1 passes; retired marketplace remains clean and untouched.
- [Workflow rules](../supply-chain-platform/docs/FULFILLMENT.md) and
  [full verification/limits](../supply-chain-platform/docs/FULFILLMENT_VERIFICATION.md) record
  evidence. No workflow capacity/SLO, remote push, deployment, worker/queue or planning write
  path is claimed. Next main-project slice: DATA-01 validated import/read-only export.

## DATA-01 — bounded CSV exchange verified locally (2026-10-09)

- Added source mappings, immutable validation/export receipts, exact stock-observation
  validation and tenant-authorized CSV export. Imports do not mutate operational stock,
  reservations, orders or shipments. All receipts remain `planningApproved=false`.
- 36 real API/PostGIS/config tests pass, including seven exchange scenarios: schema/units/
  precision/time/duplicate failures, two-instance source races and key retries, original
  hash/lineage, reader and tenant boundaries, scoped pagination, audit rollback and unchanged
  operational projections. `pnpm verify` passes 14 UI and two boundary tests plus contracts,
  typechecks and builds (52 tests total). Frozen-lockfile installation passes.
- Real disposable browser QA rejected an unmapped CSV, added source mappings and validated
  10 on-hand/2 reserved observations. The actual stock export remained 0/0/0. It exported a
  50-row facility page, hid data on failed refresh and recovered an unconfirmed export using
  its preserved request. Browser JavaScript errors were empty; the receipt view was inspected.
- The CLI download helper canceled on Windows; setting Chrome's download directory through
  CDP and clicking the actual UI downloaded 238-byte stock.csv. Its SHA-256 matched the
  receipt. QA artifacts remain ignored and disposable browser/API/web/database services
  were stopped; no fixtures were inserted into local main.
- Migration 004 applied locally and its repeat checksum check passed; 001–003 remain
  unchanged. Readiness reported database/PostGIS/migrations/restricted role all true. All
  four integration tables enforce forced tenant row security, with no snapshot_reader SELECT
  grant. Workspace Validate passes and the retired e-commerce checkout remains clean.
- See platform/docs/DATA_EXCHANGE.md and DATA_EXCHANGE_VERIFICATION.md. This bounded
  synchronous slice has no bulk capacity claim, durable worker/outbox, object store,
  external connector or write-back path. Next: DATA-02 approved immutable tenant snapshots,
  versioned hashed manifests and scoped artifact access; simulator gates remain separate.

## DATA-02 — immutable planning snapshots verified locally (2026-10-09)

- Implemented tenant-scoped point-in-time planning extraction of facilities, catalog SKUs,
  inventory balances (exact decimal atoms), and order demand into discrete CSV artifacts
  (`facilities.csv`, `skus.csv`, `stock.csv`, `orders.csv`).
- Cryptographic integrity enforced: individual SHA-256 (`contentSha256`) per artifact, root
  content digest computed from sorted artifact hashes (`hash(sorted([name:contentSha256].join(';')))`),
  and normalized manifest root fingerprint (`manifestSha256`).
- Strict append-only immutability: PostgreSQL trigger `history_guard` rejects `UPDATE`,
  `DELETE`, or `TRUNCATE` on `sc_planning_snapshots` and `sc_snapshot_artifacts`.
- Scoped planning access: `POST /snapshots` restricted to operators; `GET /snapshots`,
  `GET /snapshot`, `GET /snapshot/artifact` accessible to operators and readers with forced
  tenant RLS. Dedicated database role `snapshot_reader` is granted `SELECT` with forced RLS;
  write commands reject with permission denied.
- Zero operational mutation: extraction leaves table counts, stock balances, reservations,
  and reconciliation unchanged. Identical snapshot commands replay original manifest; key
  conflicts return 409 Conflict; injected audit failure triggers complete transactional rollback.
- Migration 005 (`005_planning_snapshots.sql`) applied locally; repeat checksum check passed;
  001–004 remain unchanged.
- Automated test evidence:
  - 43 integration tests pass against disposable loopback-only PostGIS container (`postgis/postgis:18-3.6`),
    including nine snapshot scenarios (operator gate, point-in-time extraction, hash stability,
    zero mutation, replay/conflict, tenant isolation, trigger immutability, audit rollback,
    and `snapshot_reader` role isolation).
  - `pnpm verify` passes across platform: contracts check, boundary enforcement, builds, and 15
    web UI tests in `@supply-chain/web`.
- See [platform/docs/DATA_EXCHANGE.md](../supply-chain-platform/docs/DATA_EXCHANGE.md) and
  [DATA_EXCHANGE_VERIFICATION.md](../supply-chain-platform/docs/DATA_EXCHANGE_VERIFICATION.md).

## P0-04 / ROUTE-01 / ENV-02 implementation evidence (2026-10-09)

### P0-04: Simulation Determinism, Injected Clock, Seeded PRNG, and Canonical Event Replay
- Decoupled discrete simulation clock (`SimulationClock`) from wall-clock time; supports fixed delta progression and step counts.
- Seeded Mulberry32 pseudo-random number generator (`SeededRandom`) eliminates unseeded `Math.random()` calls in entity and order generation; resets to initial seed on zero-state reset.
- Pause control freezing: vehicles and active trips halt immediately; zero coordinate changes or SLA expiration while paused.
- Zero-state reset: completely restores clean state, clearing active deliveries, events, vehicles, and dispatch queues without orphan leaks.
- Dispatch queue stabilization: replaced non-deterministic FIFO/set pops with strict 4-tier Earliest Deadline First (EDF) comparator (`slaDeadline -> priority -> id`) eliminating order-import races.
- Canonical event hashing: monotonic sequence numbering, JSON canonicalization, and SHA-256 event sequence hashing (`CanonicalEventHasher`). Repeated runs with identical inputs and seeds produce bit-identical sequence hashes.
- Test evidence:
  - `backend/tests/determinism-p0-04.test.ts`: **21 of 21 tests pass**.
  - Vitest backend suite (`pnpm test` in `logistics-sandbox/backend`): **11 test files / 76 of 76 tests pass**.
  - Frontend build (`pnpm build` in `logistics-sandbox/frontend`): clean compilation (`tsc && vite build`).

### ROUTE-01: Directed Routing Matrix, Fleet Profiles, and Strict Validation (osm-pathfinder)
- Directed cost matrix calculation (`compute_cost_matrix`): computes asymmetric N x M durations (seconds) and distances (meters) via 1-to-many Dijkstra runs.
- Road class taxonomy: introduced `RoadClass` enum (`Motorway`, `Trunk`, `Primary`, `Secondary`, `Tertiary`, `Residential`, `LivingStreet`, `Service`, `Other`) into graph edges, demo network, and OSM parser.
- Fleet vehicle profiles: `VehicleProfile` (`Car`, `Van`, `Truck`, `Motorcycle`) with road class permissions, class speed caps (e.g., Heavy Truck capped at 80 km/h on motorways, 60 km/h on primaries), and turn angle penalties (sharp U-turn: 60s for Truck vs 3s for Motorcycle).
- Cambodia geographic bounding box validation (`[10.0, 15.0]` lat, `[102.0, 108.0]` lon): out-of-bounds coordinates return HTTP 400 Bad Request instead of silent distortion.
- Disconnected / unreachable handling: unreachable matrix cells (e.g. island destinations) return explicit `null`, never 0.0 or synthetic unmarked straight lines.
- Response provenance: matrices include pinned `graph_version: "demo-cambodia-v1.0"` and `cost_model_version: "tdsp-profiles-v1.0"`.
- Strict PBF loader: `--data <path>` fails fast via `anyhow::bail!` if the file is missing; no silent demo fallback.
- Test evidence:
  - `cargo +stable-x86_64-pc-windows-gnu test`: **49 of 49 tests pass** (45 unit/lib tests + 4 integration tests).

### ENV-02: Isolated Simulator Containerization and Network Egress Controls
- Containerized `logistics-sandbox` backend (`infrastructure/sandbox/backend.Dockerfile`) using multi-stage build, `pnpm deploy`, and non-root user `sandbox` (UID 10001) on port 3001.
- Containerized `logistics-sandbox` frontend (`infrastructure/sandbox/frontend.Dockerfile`) using multi-stage Nginx alpine build, non-root user `sandbox` (UID 10001) on port 5173.
- `compose.yaml`: added `sandbox-api` and `sandbox-web` services under `profiles: [simulation]`.
- Network & secret isolation: sandbox containers are attached strictly to the `planning` bridge network and have zero operational database secrets or access to the `operations` network.
- Orchestration scripts updated:
  - `scripts/Workspace.ps1`: added `-Simulation` switch (`--profile simulation`).
  - `scripts/Validate.ps1`: verifies 4 services, simulation profile, network isolation, secret absence, loopback bindings (`127.0.0.1`), and Dockerfiles.
- End-to-end verification:
  - Dual-track E2E test suite (`tests/e2e/runner.mjs`): **44 of 44 tests pass** across 4 tiers (Tier 1: 17/17, Tier 2: 16/16, Tier 3: 7/7, Tier 4: 4/4).
  - `./scripts/Validate.ps1`: **PASS**.

### P0-05: Strict Routing Gate, Graph Provenance, and Algorithm Benchmarks
- `osm-pathfinder`:
  - `AppState`: Injected dataset provenance fields: `is_demo`, `dataset_name`, `graph_version`, `cost_model_version`.
  - API responses (`/metrics/graph`, `/route`, `/matrix`): return provenance payload with explicit graph stats and demo flag.
  - Multi-algorithm comparative benchmark tests (`tests/algorithm_benchmarks.rs`): validates cost equivalence across Dijkstra, A*, Bidirectional Dijkstra, Bidirectional A*, and Contraction Hierarchies (CH) for Phnom Penh urban and national corridor routes within 0.1% tolerance.
  - Test evidence: `cargo +stable-x86_64-pc-windows-gnu test` -> **51 of 51 tests pass** (45 unit/lib + 2 benchmark + 4 integration).
- `logistics-sandbox`:
  - `StrictRoutingError` and strict mode configuration: rejects demo graphs when real graphs are mandated (`requireRealGraph: true`), and fails fast when router is unreachable or returns routing errors.
  - Eliminated silent synthetic straight-line fallbacks during scored simulations.
  - Simulation state machine invalidation: transitions simulation status to `'invalidated'` with `invalidationReason` stamped with graph provenance.
  - Test evidence: `backend/tests/strict-routing-p0-05.test.ts` (**7 of 7 tests pass**); vitest backend suite (`pnpm test` in `logistics-sandbox/backend`): **12 test files / 83 of 83 tests pass**; frontend clean build.

### OPT-01: Baseline VRPTW Solver, Optimizer, and Independent Constraint Validator
- Independent repository initialized at `distribution-intelligence` on branch `main`.
- Clean TypeScript domain model: `ProblemDefinition`, `Depot`, `Vehicle`, `ShipmentStop`, `CostMatrix`, `VehicleRoute`, `OptimizationResult`, and `ConstraintViolation`.
- Independent `ConstraintValidator`: validates vehicle capacity limits (sum of package weights <= maxCapacity), SLA arrival time windows (`earliestArrival` <= arrival <= `latestArrival`), service times, depot opening hours, and maximum driver shift duration.
- Solvers & Optimization:
  - `GreedyVrpSolver`: Nearest-neighbor baseline solver with capacity and time-window feasibility pruning.
  - `MetaheuristicVrpOptimizer`: Local search optimizer with 2-opt intra-route edge swap, inter-route customer relocation, and empty vehicle consolidation.
- `PlanComparator`: Computes total distance, duration, vehicle count, cost savings %, and constraint satisfaction delta between baseline and optimized plans.
- `SnapshotAdapter`: Converts platform `DATA-02` snapshot manifests into solver `ProblemDefinition`.
- Test evidence: `tests/validator.test.ts`, `tests/vrptw.test.ts` -> **6 of 6 tests pass**. Clean compilation (`npx tsc`).

### PILOT-01: Enterprise Identity, RBAC, Tamper-Evident Audit & Backup Verification
- OIDC / JWT Authentication:
  - `OidcValidator`: HS256 JWT decoding and validation (`timingSafeEqual` HMAC verification, expiry `exp`, activation `nbf`, issuer `iss`, audience `aud`, tenant claim `tenant_id`, and role mapping).
  - Role-based authorization: maps admin/operator claims to `operator` role and viewer/reader to `reader` role.
- NestJS API Security Gates:
  - `TenantGuard`: Dual authentication supporting scoped 43-character API keys and OIDC bearer tokens.
  - `RolesGuard` & `@Roles(...)`: Enforces operator role on state-mutating endpoints and write operations.
- Tamper-Evident Audit Logging:
  - `AuditLog`: SHA-256 chained cryptographic hashing (`previousHash -> data -> currentHash`).
  - `verifyChainIntegrity()`: Full chain verification that detects any modification to past entries, actions, payloads, or sequence order.
  - Tenant scoping: `getEntries(tenantId)` isolates audit trails by tenant.
- Automated Backup & Schema Recovery Verification:
  - `scripts/Verify-Backup.ps1`: Automated backup creation using `pg_dump`, checksum calculation, and verification against schema migrations.
- Test evidence:
  - `node --test tests/pilot-identity-audit.test.cjs`: **7 of 7 tests pass**.
  - `pnpm test`: **8 of 8 tests pass** (config and pilot tests).
  - `pnpm check:boundaries`: **2 of 2 tests pass**, 0 boundary violations.
  - `pnpm --filter @supply-chain/web test`: **15 of 15 tests pass**.
  - `pnpm verify`: Clean verification across contracts, boundaries, build, and tests.

## Existing baseline from source investigation

- Rust: 40 tests passed with installed GNU toolchain; default MSVC link.exe unavailable.
- Rust formatting fails on pre-existing src/graph/demo.rs formatting.
- Moved TypeScript dependencies originally pointed to former absolute checkout paths; repaired above.
- Sandbox source compilation also has existing issues (chaos calling private emitEvent;
  extra state field; optional SLA deadline; missing PredictiveAiMetrics type import).
- Docker context is desktop-linux; its engine was stopped initially and is now running.
- No real Cambodia PBF is present in osm-pathfinder/data.
- Operational platform OPS-01 is implemented locally as recorded above. OIDC/pilot
  authorization, consolidated shipments/transport detail, immutable artifacts, solver and scenario
  control remain pending. OPS-02 inventory and OPS-03 workflows have local evidence above.

## Runtime gates

1. ENV-01 compilation and P0-01 runtime isolation pass locally. Before adding simulator
   containers, implement ENV-02 deployment restrictions and P0-04 determinism.
2. Implement tenant authorization and tenant-scoped snapshot extraction; role separation is
   not a substitute for tenant isolation or a production egress firewall.
3. Add a real Cambodia extract, graph/provenance metadata and supported routing validation
   before scoring enterprise scenarios. Real-PBF overlay is structurally validated only.
4. Implement business migrations and application workflows; local services are infrastructure,
   not an operational product or enterprise security certification.
5. Accept real customer data only after implemented access, audit, retention and isolation tests.

Runtime inspection on 2026-10-09 found workspace PostGIS/demo routing and the independent
marketplace lab containers running. Temporary platform QA services were stopped; start the
host API/web with the documented pnpm commands when needed. Stop host processes with Ctrl+C
and infrastructure with ./scripts/Workspace.ps1 down. Named volumes and credentials remain intact.

No database volumes are deleted by setup or service shutdown. Remote repositories, pushes,
customer contacts and production deployments are outside this completed local setup.
