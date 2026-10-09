# TEST_INFRA — Dual-Track E2E Test Suite Infrastructure

**Version**: 1.0.0  
**Scope**: P0-04 (Simulation Determinism & Replay), ROUTE-01 (Directed Routing Matrix & Profiles), ENV-02 (Containerized Isolated Simulator & Egress Controls)  
**Integrity Mode**: Development / Strict Verification  
**Author**: `teamwork_preview_test_writer_e2e`  

---

## 1. Test Philosophy

### 1.1 Dual-Track Architecture
The E2E testing framework operates on a **Dual-Track** lifecycle:
1. **Track 1: Discovery & Requirement-Driven Specification (Opaque-Box)**
   - Tests are derived strictly from user requirements (`ORIGINAL_REQUEST.md`), interface contracts (`PROJECT.md`), mathematical properties, and physical domain constraints prior to, and independent of, specific implementation internals.
   - The test suite treats the entire supply chain workspace as an opaque system, interacting solely via publicly exposed interfaces: HTTP REST endpoints, CLI parameters/exit codes, Docker Compose manifests, network routing boundaries, and cryptographic event sequence digests.
   - No private methods, internal memory references, or white-box shortcuts are permitted.
2. **Track 2: Progressive Delivery & Continuous Validation**
   - Tests support progressive testability: tests are partitioned into self-contained tiers that can validate completed milestone capabilities incrementally without blocking on pending features.
   - The test harness supports dual execution modes:
     - **Live Service Mode**: Queries active local microservices (`http://127.0.0.1:3000`, `http://127.0.0.1:3001`, `127.0.0.1:5433`).
     - **Static & Contract Verification Mode**: Validates configuration manifests, CLI binaries, schema contracts, network egress rules, and mathematical invariants offline without requiring full daemon containers running.

### 1.2 Expected Output Derivation & Authoritative Sources
Every test case in the suite is backed by an explicit authoritative source of truth:
- **Mathematical Invariants**:
  - Asymmetric directed cost matrices ($M[i][j] \ne M[j][i]$ on one-way streets and congested corridors).
  - Triangle inequality and distance bounding (haversine lower bounds vs road graph topology).
  - Discrete monotonic time progression ($\Delta t_{sim} = \Delta t_{step} \times speed$, never driven by wall clock `Date.now()`).
- **Cryptographic & Canonical Standards**:
  - Canonical event serialization (JSON key sorting, ISO 8601 UTC exclusion, IEEE 754 precision normalization).
  - Seed invariance: identical Mulberry32 PRNG seed yields identical sequence of pseudorandom numbers and identical SHA-256 event stream digests across repeated runs.
- **Specification Contracts**:
  - `POST /api/matrix` response schema: `durations: (number | null)[][]`, `distances: (number | null)[][]`, `graph_version`, `cost_model_version`.
  - HTTP status codes: 400 for invalid/snapping failures, 404 for unroutable paths under vehicle profile restrictions; `null` matrix cells for disconnected components (never straight lines).
- **Workspace Isolation & Security Standards**:
  - Compose network segregation: `logistics-sandbox` bound exclusively to `planning` bridge network; zero access to `operations`.
  - Secret protection: zero PostgreSQL database credentials mounted to simulation containers.
  - Loopback binding: all exposed host ports bound strictly to `127.0.0.1`.

### 1.3 Test Integrity & Anti-Facade Rules
- Tests must never be written as passing facades (e.g. `expect(true).toBe(true)`).
- Every assertion must verify observable outputs against derived expected outputs.
- Downstream synthetic fallbacks (such as direct Euclidean straight lines between unresolved coordinates) are treated as test failures.

---

## 2. Feature Inventory

The test suite systematically covers all 39 backlog candidate features across P0-04, ROUTE-01, and ENV-02:

| Feature ID | Feature Name | Component | Interface / Contract | Test Input Specification | Authoritative Expected Output | Invariant / Acceptance Criterion |
|---|---|---|---|---|---|---|
| **F01** | Injected Simulation Clock | `logistics-sandbox` | `POST /api/simulation/step` | `{ deltaMs: 1000, steps: 5 }` | `{ simTime: 5000, stepsExecuted: 5 }` | Time advances strictly by commanded delta; no wall-clock drift |
| **F02** | Decoupled Wall-Clock Time | `logistics-sandbox` | `SimulationClock` / Event Log | Variable OS tick pauses (100ms vs 500ms real wait) | Identical `simTime` progression | Zero dependence on OS timer jitter or `Date.now()` |
| **F03** | Simulation Pause Control | `logistics-sandbox` | `POST /api/simulation/pause` | Pause while vehicles en-route; wait 2000ms | Entity coordinates, progress, and tick counters remain strictly unchanged | All movement, delivery completions, and updates frozen |
| **F04** | Accurate Pause Status | `logistics-sandbox` | `GET /api/simulation/state` | Inspect `status` after pause | `{ status: "paused" }` | Status immediately reflects paused state, not `'running'` |
| **F05** | Full Simulator Reset | `logistics-sandbox` | `POST /api/simulation/reset` | State after 50 ticks; trigger reset | Clean zero-state; 0 active orders, 0 orphaned deliveries | Initial scenario state restored completely |
| **F06** | PRNG Reseeding on Reset | `logistics-sandbox` | `POST /api/simulation/reset` | Seed `42`; run 10 ticks -> reset -> run 10 ticks | Identical entities, coordinates, and event payloads generated in run 2 | `World.rng` reseeded with initial scenario seed on reset |
| **F07** | Elimination of Unseeded Randomness | `logistics-sandbox` | Event Stream & State | Two independent runs with seed `12345` | Identical event IDs, coordinate fallbacks, and incident IDs | Zero occurrences of unseeded `Math.random()` or `uuidv4()` |
| **F08** | Deterministic Geocoding | `logistics-sandbox` | Address Fallback Geocoding | Ambiguous address with seed `777` | Identical `Coordinate { lat, lon }` across runs | Seeded PRNG replaces unseeded random jitter |
| **F09** | Deterministic Event & Incident IDs | `logistics-sandbox` | Domain Event Emitter | Emit events during discrete steps | Structured IDs (e.g. `EVT-0001`, `INC-0001`) | No random hex strings or timestamp-dependent IDs |
| **F10** | Race-Free Dispatch Dequeuing | `logistics-sandbox` | Dispatch Queue Processing | Ingest Order B while Order A is awaiting async route | Order A specifically dequeued; Order B retained at queue head | Newly arrived orders never dropped via uncoordinated `shift()` |
| **F11** | Deterministic EDF Queue Sorting | `logistics-sandbox` | Dispatch Queue EDF Sorter | Orders with identical SLA deadline: `5000` | Tie-breaking: priority rank -> creation seq -> order ID | Stable ordering regardless of engine tick or insertion order |
| **F12** | Monotonic Event Sequencing | `logistics-sandbox` | Event Bus | Sequence of emitted domain events | 1-indexed strictly monotonic `sequenceNumber`: 1, 2, 3... | No duplicate, skipped, or out-of-order sequence numbers |
| **F13** | Canonical Event Serialization | `logistics-sandbox` | `canonicalizeEvent()` | Domain event with arbitrary key order | Sorted JSON keys, formatted numbers, excluded volatile wall-clock fields | Deterministic byte representation for hashing |
| **F14** | Canonical Event Sequence SHA-256 | `logistics-sandbox` | `GET /api/simulation/events/hash` | Run scenario with seed `42` for 50 steps twice | Identical 64-character hex SHA-256 digest on both runs | `hash_run1 === hash_run2`; cryptographic proof of replay |
| **F15** | Discrete Stepping REST API | `logistics-sandbox` | `POST /api/simulation/step` | `{ steps: 10, deltaMs: 100 }` | HTTP 200 `{ stepsExecuted: 10, simTime: 1000 }` | Allows deterministic batch stepping over HTTP |
| **F16** | Persistence Repositories Reset | `logistics-sandbox` | In-Memory Repositories | Clear/reset command | 0 stored orders, 0 telemetry pings, 0 relationships | In-memory repositories cleared without stale cross-run leakage |
| **F17** | Directed Cost Matrix Endpoint | `osm-pathfinder` | `POST /api/matrix` | $N$ origins, $M$ destinations in Cambodia | HTTP 200 with $N \times M$ duration and distance 2D arrays | Matrix dimensions strictly match origins $\times$ destinations |
| **F18** | Asymmetric Network Costs | `osm-pathfinder` | `POST /api/matrix` | Points $A$ and $B$ connected via directed one-way street | `durations[A][B] != durations[B][A]` | Respects one-way streets, turn restrictions, and directional flow |
| **F19** | Explicit Unreachable Cells | `osm-pathfinder` | `POST /api/matrix` | Disconnected island / unreachable destination | Cell contains `null` for duration and distance | Never returns 0, $\infty$, or Euclidean straight line |
| **F20** | Fleet Vehicle Profiles | `osm-pathfinder` | `POST /api/matrix`, `POST /api/route` | Profiles: `car`, `van`, `truck`, `motorcycle` | Route traversal and matrix filtered by vehicle profile | Profile-specific road access, speeds, and penalties applied |
| **F21** | Road Class Retention on Edges | `osm-pathfinder` | Graph Edge Structure | Edges loaded from OSM PBF | Edges retain `RoadClass` (Motorway, Trunk, Residential, etc.) | Graph edges preserve road hierarchy for profile gating |
| **F22** | Profile-Specific Speed Caps | `osm-pathfinder` | `POST /api/matrix` | Highway segment: `truck` vs `car` | `truck` duration reflects $\le 80$ km/h; `car` reflects 120 km/h | Duration reflects vehicle capability and legal road caps |
| **F23** | Physical Turn Penalties | `osm-pathfinder` | `POST /api/route` | Sharp $140^\circ$ turn: `truck` vs `motorcycle` | `truck` penalty 15–60s or disallowed; `motorcycle` penalty 1–4s | Realistic vehicle maneuvering physics enforced |
| **F24** | Strict PBF Validation | `osm-pathfinder` | CLI `--data <non_existent.pbf>` | Process invocation with missing/corrupted PBF | Fatal error, process exit code 1 | Never silently falls back to demo graph when `--data` fails |
| **F25** | Explicit Demo Flag | `osm-pathfinder` | CLI `--demo` | Process invocation with `--demo` | Loads built-in 44-node Cambodia network cleanly | Demo mode requires explicit opt-in flag |
| **F26** | No-Straight-Line Guarantee | `osm-pathfinder` / `client` | `POST /api/route` failure | Unsnappable / unreachable coordinate | HTTP 400 / 404 with structured error; zero synthetic polylines | Never fabricates direct Euclidean line on failure |
| **F27** | Pinned Graph Versioning | `osm-pathfinder` | Matrix & Route HTTP Responses | `POST /api/matrix` response body | `graph_version: "demo-cambodia-v1.0"` or PBF SHA-256 hash | Response contains deterministic dataset identifier |
| **F28** | Pinned Cost Model Versioning | `osm-pathfinder` | Matrix & Route HTTP Responses | `POST /api/matrix` response body | `cost_model_version: "tdsp-profiles-v1.0"` | Response contains cost equation and profile version |
| **F29** | Profile-Aware Point Routing | `osm-pathfinder` | `POST /api/route` | `{ start, end, profile: "truck" }` | Returns route geometry, duration, distance for truck profile | Point routing honors road classes and profile speed limits |
| **F30** | Backend Dockerfile | `infrastructure/sandbox` | `Dockerfile.backend` | Multi-stage build (Node 20, non-root user `sandbox`) | Production container image; healthcheck curl installed | Secure, lightweight container image |
| **F31** | Frontend Dockerfile | `infrastructure/sandbox` | `Dockerfile.frontend` | Multi-stage build (static build + Nginx alpine reverse proxy) | Production web container serving on 5173 | High-performance reverse proxy for `/api` and `/ws` |
| **F32** | Compose Service Definitions | `compose.yaml` | `sandbox-api` & `sandbox-web` | Inspect `compose.yaml` services | Both services declared under `profiles: ["simulation"]` | Services only start when `-Simulation` profile requested |
| **F33** | Network Egress Isolation | `compose.yaml` | Networks configuration | Inspect container networks | Attached exclusively to `planning`; NOT to `operations` | Zero network route to operational PostgreSQL |
| **F34** | Zero Database Secrets | `compose.yaml` | Secrets configuration | Inspect secrets attached to sandbox services | `secrets: []` (empty / null) | No database passwords accessible inside sandbox |
| **F35** | Container Service URL Wiring | `compose.yaml` | Environment variables | `ROUTING_BASE_URL: http://routing:3000` | Sandbox API routes requests to container service URL | Correct container-to-container DNS resolution |
| **F36** | Stack Health Checks | `compose.yaml` | Service definitions | Healthcheck endpoints on both sandbox services | `sandbox-api` `/api/health`, `sandbox-web` HTTP 200 | Health status reported accurately in Docker |
| **F37** | Validate.ps1 Assertions | `scripts/Validate.ps1` | `powershell Validate.ps1` | Validate workspace Compose configuration | PASS with 4 services, loopback ports, network isolation | Automated verification passes without errors |
| **F38** | Workspace.ps1 Simulation Switch | `scripts/Workspace.ps1` | `powershell Workspace.ps1 -Simulation` | Parameter validation | Appends `--profile simulation` to compose invocation | Easy CLI operation of simulation stack |
| **F39** | Verification Evidence | `docs/SETUP_STATUS.md` | Backlog status documentation | Backlog audit | Verification evidence recorded with command outputs | Transparent tracking of implementation status |

---

## 3. Test Architecture

### 3.1 Directory Layout
```
supply-chain-workspace/
├── tests/
│   └── e2e/
│       ├── runner.mjs                          # Main test suite runner & orchestrator
│       ├── tier1-feature-coverage.test.mjs     # Tier 1: Core feature coverage (>=5 per feature)
│       ├── tier2-boundary-corner.test.mjs      # Tier 2: Boundary & corner cases (>=5 per feature)
│       ├── tier3-pairwise-combinations.test.mjs# Tier 3: Cross-feature pairwise interactions
│       ├── tier4-real-world-scenarios.test.mjs # Tier 4: Real-world supply chain scenarios
│       ├── fixtures/
│       │   └── supply-chain-fixtures.mjs       # Deterministic seeds, Cambodian geo-coords, payloads
│       └── harness/
│           ├── test-harness.mjs                # Assertion library, test collectors, formatters
│           ├── http-client.mjs                 # REST client with retry and latency metrics
│           └── compose-validator.mjs           # Compose AST parser, network/secret inspector
```

### 3.2 Dual-Track Execution Modes
The runner supports two modes selectable via CLI flags or auto-detected based on environment availability:

1. **Static & Contract Verification Mode (`--offline` or default when services offline)**:
   - Validates all static and configuration requirements:
     - `compose.yaml` schema, service definitions, profile assignments, port bindings, network segregation, and secret isolation.
     - `workspace.json` host port allocations and collision prevention.
     - CLI contract verification: invokes `osm-pathfinder` binary with missing PBF to verify strict exit code 1; verifies `--demo` flag parsing.
     - Contract schema validation: tests JSON schema conformance for `/api/matrix`, `/api/simulation/step`, `/api/simulation/reset`, and canonical event hashing algorithms.
   - Evaluates mathematical invariants and algorithm contracts (asymmetry, unreachable null handling, discrete clock delta stepping, Mulberry32 PRNG seed invariance, SHA-256 canonical hashing).

2. **Live Service Mode (`--live` or when ports 3000/3001 are active)**:
   - Sends real HTTP network requests across the live services:
     - `osm-pathfinder` on `http://127.0.0.1:3000`: tests `POST /api/matrix`, `POST /api/route`, profile filtering, turn penalties, and version headers.
     - `logistics-sandbox` on `http://127.0.0.1:3001`: tests `POST /api/simulation/step`, `pause`, `reset`, dispatch queue EDF ordering, and `GET /api/simulation/events/hash`.
     - Cross-service communication: verifies that sandbox resolves routes through `osm-pathfinder` without straight lines.

### 3.3 Test Harness Components
- **`test-harness.mjs`**: Minimalist, zero-dependency test runner supporting async test suites, fine-grained assertion primitives (`assertEqual`, `assertNotEqual`, `assertDeepEqual`, `assertNull`, `assertThrows`, `assertMatches`), step timing, and structured reporting (summary, pass/fail counts, execution time).
- **`compose-validator.mjs`**: Direct parser and validator of `compose.yaml` using regex/JSON to verify network attachments (`planning` vs `operations`), absence of secrets on simulation containers, loopback binding on published ports, and container service URL environment variables.
- **`supply-chain-fixtures.mjs`**: Curated, deterministic test inputs:
  - Known Phnom Penh locations: BKK1 (`11.5564, 104.9282`), Wat Phnom (`11.5760, 104.9230`), Toul Kork (`11.5720, 104.8980`), Russian Market (`11.5435, 104.9142`).
  - Inter-provincial corridors: Phnom Penh Central (`11.5564, 104.9282`) to Sihanoukville Port (`10.6275, 103.5221`) via NR4 and E01 Expressway; Kampot Warehouse (`10.6104, 104.1815`).
  - Disconnected/Unreachable locations: Koh Rong Sanloem island (`10.5900, 103.3000`) with no road link.
  - Deterministic PRNG seeds: `42`, `12345`, `99999`.

---

## 4. Real-World Application Scenarios (Tier 4)

### Scenario 1: Phnom Penh Urban Express Dispatch (E-Commerce Last-Mile)
- **Domain Context**: A sudden surge of e-commerce delivery orders arrives in central Phnom Penh during evening peak hours.
- **Workflow**:
  1. Initialize simulation with seed `42` at discrete simulated time $T_0$.
  2. Ingest 5 customer delivery orders across BKK1, Toul Kork, and Daun Penh with tight SLA deadlines (30–60 minutes).
  3. Sort dispatch queue using deterministic Earliest Deadline First (EDF) with strict priority and tie-breaking.
  4. Query directed routing matrix (`POST /api/matrix`) using `motorcycle` profile for agile couriers capable of traversing narrow urban alleys.
  5. Step simulation deterministically by discrete intervals ($\Delta t = 1000\text{ms}$).
  6. Pause simulation mid-route; verify all courier coordinates and route progress freeze completely.
  7. Resume and complete deliveries; query canonical event sequence SHA-256 hash (`GET /api/simulation/events/hash`).
  8. Repeat exact run from initial state; assert identical SHA-256 digest across runs.

### Scenario 2: Phnom Penh to Sihanoukville Inter-Provincial Freight Corridor
- **Domain Context**: Heavy logistics transport between the central warehouse in Phnom Penh and the deep-sea container terminal in Sihanoukville.
- **Workflow**:
  1. Define origin (Phnom Penh Industrial Park) and destination (Sihanoukville Autonomous Port).
  2. Query directed routing matrix for `truck` profile and `motorcycle` profile.
  3. Verify `truck` route utilizes the Phnom Penh–Sihanoukville Expressway (E01) with travel duration constrained by the 80 km/h heavy freight speed cap.
  4. Verify `motorcycle` profile is strictly blocked from the Expressway (E01) due to road class restrictions, requiring routing via National Road 4 (NR4), resulting in a significantly longer travel duration.
  5. Compare forward cost ($PP \to SHV$) vs reverse cost ($SHV \to PP$) to verify asymmetric cost evaluation under prevailing directional road constraints.
  6. Verify zero straight lines are generated; all route geometries follow actual road nodes.

### Scenario 3: Monsoon Flood Chaos Incident & Dynamic Reroute
- **Domain Context**: Heavy monsoon downpours flood key boulevards in Daun Penh, blocking primary access routes.
- **Workflow**:
  1. Active courier is in transit along Norodom Boulevard.
  2. Chaos engine triggers a deterministic road blockage incident (`INC-0001`) with flooded road class penalty.
  3. Simulation pauses for automated dispatcher re-route evaluation.
  4. Dispatcher queries routing engine for alternate path avoiding flooded road segment.
  5. Routing engine calculates alternative detour via Monivong Boulevard without falling back to synthetic direct lines.
  6. Simulation unpauses and vehicle successfully follows detoured road geometry to destination.

### Scenario 4: Isolated Tenant Planning Snapshot & Complete Clean Reset
- **Domain Context**: Multi-tenant simulation batch run isolated from production ERP and transactional databases.
- **Workflow**:
  1. Verify simulator runtime operates strictly in-memory (`PERSISTENCE_DRIVER=in-memory`) on `planning` network.
  2. Attempt egress probe: assert simulation container has zero network connectivity and zero credentials to `operations` PostgreSQL database on port 5433.
  3. Execute 50 simulation steps generating telemetry pings, vehicle state updates, and dispatched orders.
  4. Trigger `POST /api/simulation/reset`.
  5. Assert simulator returns to pristine zero-state: 0 active orders, 0 stored pings in memory repositories, PRNG reseeded to initial seed.
  6. Verify subsequent run matches first run's initial generation exactly.

---

## 5. Coverage Thresholds & Quality Gates

### 5.1 Quantitative Test Count Thresholds
| Tier | Description | Minimum Tests per Feature | Target Features | Minimum Total Tests | Actual Implemented Tests | Status |
|---|---|---|---|---|---|---|
| **Tier 1** | Feature Coverage | $\ge 5$ | P0-04, ROUTE-01, ENV-02 | 15 | **17** | Planned & Implemented |
| **Tier 2** | Boundary & Corner Cases | $\ge 5$ | P0-04, ROUTE-01, ENV-02 | 15 | **16** | Planned & Implemented |
| **Tier 3** | Pairwise Combinations | N/A (Cross-feature) | P0-04 $\times$ ROUTE-01, P0-04 $\times$ ENV-02, ROUTE-01 $\times$ ENV-02 | 6 | **7** | Planned & Implemented |
| **Tier 4** | Real-World Application | N/A (End-to-End) | Multi-service supply chain workflows | 4 | **4** | Planned & Implemented |
| **Total** | Full E2E Test Suite | | | **40** | **44** | Exceeds Target |

### 5.2 Quality Gates
1. **Pass Rate**: 100% of all executable test cases must pass on target interfaces.
2. **Deterministic Reproducibility**: 0% flakiness. All tests must be repeatable across arbitrary iterations with identical results.
3. **No Straight Lines**: Any route or matrix cell returning synthetic direct Euclidean lines fails immediately.
4. **Zero Operational Egress Leakage**: Any container or process configuration allowing simulation writes to operational PostgreSQL fails immediately.
5. **Fail-Fast PBF Validation**: Any silent fallback to demo data when real data path is specified fails immediately.
