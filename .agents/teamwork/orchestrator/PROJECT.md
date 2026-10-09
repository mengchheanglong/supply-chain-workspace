# Project: Supply Chain Workspace Backlog (P0-04, ROUTE-01, ENV-02)

## Architecture
- **logistics-sandbox**: Deterministic Node/TypeScript simulation engine, discrete clock stepping, seeded RNG (Mulberry32), race-free dispatch queue, pause/resume/reset controls, canonical event hashing (SHA-256).
- **osm-pathfinder**: High-performance Rust routing engine (Axum), directed cost matrix calculation (`/api/matrix`), fleet vehicle profiles (`car`, `van`, `truck`, `motorcycle`), road class filtering (`RoadClass` on `Edge`), strict PBF graph validation (fail-fast, no silent demo fallback), and pinned graph/cost model versioning.
- **workspace / root compose**: Docker Compose containerization of `logistics-sandbox` under `simulation` profile, network isolation on `planning` bridge network, complete isolation from `operations` network and PostgreSQL credentials, loopback port bindings (`127.0.0.1:3001` and `127.0.0.1:5173`), and automated validation scripts (`scripts/Validate.ps1`, `scripts/Workspace.ps1`).
- **E2E Testing Track**: Multi-tier opaque-box test suite (Tiers 1-4) verifying end-to-end user requirements across all modules, followed by adversarial coverage hardening (Tier 5).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F01: Injected Simulation Clock | Discrete step stepping `ISimulationClock.step(deltaSimMs)` & `reset()` | M1 (P0-04) | survey-1 |
| 2 | F02: Decoupled Wall-Clock Time | Eliminate `Date.now()` and OS timer jitter dependencies in simulation | M1 (P0-04) | survey-1 |
| 3 | F03: Simulation Pause Control | Freeze all entity movements, progress increments, and updates on pause | M1 (P0-04) | survey-1 |
| 4 | F04: Accurate Pause Status | `getState().status` returns `'paused'` immediately when paused | M1 (P0-04) | survey-1 |
| 5 | F05: Full Simulator Reset | `engine.reset()` and `POST /api/simulation/reset` restore clean zero-state | M1 (P0-04) | survey-1 |
| 6 | F06: PRNG Reseeding on Reset | `World.reset()` reseeds `SeededRandom(seed)` with initial scenario seed | M1 (P0-04) | survey-1 |
| 7 | F07: Elimination of Unseeded Randomness | Replace all 11 `Math.random()`, `Date.now()`, and `uuidv4()` occurrences | M1 (P0-04) | survey-1 |
| 8 | F08: Deterministic Geocoding | Fallback geocoding uses seeded PRNG instead of `Math.random()` | M1 (P0-04) | survey-1 |
| 9 | F09: Deterministic IDs | Generate stable incident, chaos, and event IDs from step counter and seed | M1 (P0-04) | survey-1 |
| 10 | F10: Race-Free Dispatch Dequeuing | Dequeue specific order ID upon dispatch; prevent dropping unshifted orders | M1 (P0-04) | survey-1 |
| 11 | F11: Deterministic EDF Queue Sorting | Stable tie-breaking for EDF sort (SLA -> priority -> creation seq -> order ID) | M1 (P0-04) | survey-1 |
| 12 | F12: Monotonic Event Sequencing | Assign incremental `sequenceNumber` to every domain event | M1 (P0-04) | survey-1 |
| 13 | F13: Canonical Event Serialization | Sorted JSON keys, formatted numbers, excluded volatile wall-clock fields | M1 (P0-04) | survey-1 |
| 14 | F14: Canonical Event Sequence SHA-256 | SHA-256 hash over canonical event sequence (`GET /api/simulation/events/hash`)| M1 (P0-04) | survey-1 |
| 15 | F15: Discrete Stepping API | Endpoint `POST /api/simulation/step` for multi-tick stepping | M1 (P0-04) | survey-1 |
| 16 | F16: Persistence Collection Reset | Clear in-memory repositories (orders, pings, vehicles, relationships) | M1 (P0-04) | survey-1 |
| 17 | F17: Directed Cost Matrix Endpoint | `POST /api/matrix` computing $N \times M$ duration and distance matrices | M2 (ROUTE-01) | survey-2 |
| 18 | F18: Asymmetric Network Costs | Support asymmetric forward/reverse durations and distances ($M[i][j] \ne M[j][i]$) | M2 (ROUTE-01) | survey-2 |
| 19 | F19: Explicit Unreachable Cells | Return `null` for disconnected/restricted pairs; never straight lines | M2 (ROUTE-01) | survey-2 |
| 20 | F20: Fleet Vehicle Profiles | `car`, `van`, `truck`, `motorcycle` profiles with road access restrictions | M2 (ROUTE-01) | survey-2 |
| 21 | F21: Road Class Retention on Edges | Retain `RoadClass` enum on graph `Edge` during PBF and demo loading | M2 (ROUTE-01) | survey-2 |
| 22 | F22: Profile Speed Limits | Profile-specific legal and physical maximum speeds per road class | M2 (ROUTE-01) | survey-2 |
| 23 | F23: Physical Turn Penalties | Profile-scaled turn penalties and turning angle restrictions | M2 (ROUTE-01) | survey-2 |
| 24 | F24: Strict PBF Validation | Fail-fast exit code 1 on missing/corrupt PBF; no silent demo fallback | M2 (ROUTE-01) | survey-2 |
| 25 | F25: Explicit Demo Flag | Require explicit `--demo` flag to load built-in Cambodia network | M2 (ROUTE-01) | survey-2 |
| 26 | F26: No-Straight-Line Guarantee | Reject failed routes with structured error; eliminate downstream direct lines | M2 (ROUTE-01) | survey-2 |
| 27 | F27: Pinned Graph Versioning | Responses contain `graph_version` (hash or semantic identifier) | M2 (ROUTE-01) | survey-2 |
| 28 | F28: Pinned Cost Model Versioning | Responses contain `cost_model_version` | M2 (ROUTE-01) | survey-2 |
| 29 | F29: Profile-Aware Point Routing | Extend `POST /api/route` with `profile` parameter | M2 (ROUTE-01) | survey-2 |
| 30 | F30: Backend Dockerfile | Multi-stage Dockerfile for `sandbox-api` (Node 20, non-root user) | M3 (ENV-02) | survey-3 |
| 31 | F31: Frontend Dockerfile | Multi-stage Dockerfile for `sandbox-web` (production web server/proxy) | M3 (ENV-02) | survey-3 |
| 32 | F32: Compose Service Definitions | Services `sandbox-api` and `sandbox-web` under profile `simulation` | M3 (ENV-02) | survey-3 |
| 33 | F33: Network Isolation | Connect exclusively to `planning` bridge network; zero access to `operations` | M3 (ENV-02) | survey-3 |
| 34 | F34: Zero Database Secrets | No operational PostgreSQL secrets mounted to simulation containers | M3 (ENV-02) | survey-3 |
| 35 | F35: Container Service URL Wiring | `ROUTING_BASE_URL: http://routing:3000`, frontend proxy to `sandbox-api:3001` | M3 (ENV-02) | survey-3 |
| 36 | F36: Stack Health Checks | Healthchecks on `sandbox-api` (`/api/health`) and `sandbox-web` | M3 (ENV-02) | survey-3 |
| 37 | F37: Validate.ps1 Assertions | Update `scripts/Validate.ps1` to assert 4 services, network isolation, secrets | M3 (ENV-02) | survey-3 |
| 38 | F38: Workspace.ps1 Simulation Switch | Add `-Simulation` parameter to `./scripts/Workspace.ps1` | M3 (ENV-02) | survey-3 |
| 39 | F39: Evidence & Documentation Update | Update `docs/BACKLOG.md` and `docs/SETUP_STATUS.md` with verification | M3 (ENV-02) | survey-3 |
| 40 | F40: E2E Test Suite Infrastructure | Requirement-driven test harness and test runner across P0-04, ROUTE-01, ENV-02 | M4 (Final) / E2E Track | survey-e2e |
| 41 | F41: Tier 1 Feature Coverage Tests | ≥5 isolated tests per feature (P0-04, ROUTE-01, ENV-02) | M4 (Final) / E2E Track | survey-e2e |
| 42 | F42: Tier 2 Boundary & Corner Tests | ≥5 boundary/edge tests per feature | M4 (Final) / E2E Track | survey-e2e |
| 43 | F44: Tier 3 Cross-Feature Combinations | Pairwise feature interaction tests across modules | M4 (Final) / E2E Track | survey-e2e |
| 44 | F44: Tier 4 Real-World Application | Realistic supply chain scenarios (PP urban dispatch, multi-vehicle VRP) | M4 (Final) / E2E Track | survey-e2e |
| 45 | F45: Tier 5 Adversarial Hardening | Challenger-driven white-box test gap analysis and stress hardening | M4 (Final) | survey-e2e |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | P0-04 Simulation Determinism & Replay | `logistics-sandbox` clock, RNG, queue race, pause/reset, canonical event hash | none | PLANNED |
| M2 | ROUTE-01 Directed Routing Matrix & Profiles | `osm-pathfinder` directed matrix, profiles, road class, strict PBF, versioning | none | PLANNED |
| M3 | ENV-02 Containerization & Network Isolation | Root `compose.yaml`, Dockerfiles, `Validate.ps1`, `Workspace.ps1`, docs | M1, M2 | PLANNED |
| M4 | Final Milestone E2E & Hardening | Phase 1: 100% pass Tiers 1-4 E2E tests; Phase 2: Tier 5 adversarial hardening | M1, M2, M3 | PLANNED |

## Interface Contracts
### logistics-sandbox ↔ osm-pathfinder
- **Endpoint**: `POST /api/matrix`
- **Request**: `{ origins: [{lat, lon}], destinations: [{lat, lon}], profile?: "car"|"van"|"truck"|"motorcycle", departure_time?: string }`
- **Response**: `{ durations: (number | null)[][], distances: (number | null)[][], profile: string, graph_version: string, cost_model_version: string, query_time_ms: number }`
- **Error States**: Snapping failure returns HTTP 400; unreachable destination pairs return `null` in respective matrix cell (never synthetic straight lines).

### logistics-sandbox ↔ Root Workspace Compose
- **Container Name**: `sandbox-api` (Express backend, port 3001) and `sandbox-web` (Web frontend, port 5173).
- **Environment**: `ROUTING_BASE_URL: http://routing:3000`, `PERSISTENCE_DRIVER: in-memory`.
- **Network**: Attached only to `planning` bridge network. Must NOT connect to `operations`.
- **Secrets**: No secrets attached.

## Code Layout
- `logistics-sandbox/backend/`: Node/TypeScript backend for simulation.
- `logistics-sandbox/frontend/`: React/Vite/Tailwind frontend.
- `osm-pathfinder/`: Rust Axum routing engine and CLI.
- `infrastructure/sandbox/`: Dockerfiles and nginx configs for sandbox containers.
- `compose.yaml`: Root Compose multi-service definition.
- `scripts/`: PowerShell automation (`Validate.ps1`, `Workspace.ps1`, `Setup.ps1`, `Verify-Database.ps1`).
- `docs/`: Workspace architectural documentation and backlog status.
