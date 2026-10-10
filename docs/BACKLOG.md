# Dependency-ordered implementation backlog

All items from ENV-01 through PILOT-01 and cross-repository pipeline SIM-EXP-01 are completed and verified locally.
Container egress enforcement belongs to ENV-02. Configuration alone does not satisfy feature gates.
Schedule estimates in the source blueprint are advisory; work proceeds by exit criteria.

| ID | Owner | Work | Acceptance evidence | Dependencies |
|---|---|---|---|---|
| ENV-01 | workspace / JS repos | Completed: dependencies and sandbox compilation | Frozen installs; sandbox backend/frontend typechecks; 50 backend tests pass | None |
| P0-01 | logistics-sandbox | Completed: upstream read adapter and local write repositories | 500 imported deliveries over 24 simulated hours leave mock orders/stock/GPS unchanged; remote adapters removed; forbidden API writes return 403 | ENV-01 |
| P0-02 | ecommerce-hive-nosql | Completed: transactional reserve/release/ship lifecycle and idempotency | 19 isolated unit/database/HTTP/web tests; concurrent overselling prevented; multi-SKU and ledger failures roll back; backend build/web typecheck pass | ENV-01 |
| P0-03 | ecommerce-hive-nosql / sandbox | Completed: fixture source truth and one simulated sink owner | Labelled fixtures; HTTP ping writes return 503; web outage clears roster; sandbox concurrent retries deduplicate; current-run playback; 55 sandbox and 10 marketplace tests, typechecks and browser QA pass | ENV-01, P0-01 |
| P0-04 | logistics-sandbox | Completed locally: inject clock/RNG, fixed event order, reset and replay | 21/21 determinism tests pass, 76/76 backend tests pass; bit-identical PRNG draws, frozen state on pause, clean zero-state reset, identical canonical event sequence SHA-256 hashes | ENV-01, P0-01 |
| P0-05 | sandbox / osm-pathfinder | Completed locally: strict routing, graph provenance, verified algorithm/metric constraints | 51/51 Rust tests (benchmarks across Dijkstra/A*/Bidirectional/CH), 83/83 sandbox backend tests; demo graph rejection and fail-fast run invalidation | P0-04 |
| OPS-01 | supply-chain-platform | Completed locally: Nest/React shell, scoped access, facilities/SKUs and migrations | Ten real PostGIS/config tests; build/typecheck/frozen install; tenant/role/RLS rejection, audit rollback, migration drift and outage checks; local readiness and browser auth QA | ENV-01 |
| ARCH-01 | supply-chain-platform | Completed locally: align OPS-01 with accepted scalable architecture | Backend module/transport boundaries, Fastify, generated OpenAPI/client, scoped frontend routes/queries, cursor pagination, enforced imports and reproducible performance baseline; preserve foundation regressions | OPS-01 |
| OPS-02 | supply-chain-platform | Completed locally: inventory ledger and reservations | 20 API/database tests (8 inventory cases), 8 UI and 2 boundary tests; two-instance retry/overselling and rollback; reconciliation, browser flows and contention baseline | ARCH-01 |
| OPS-03 | supply-chain-platform | Completed locally: demand, partial allocation, picking/packing and shipment states | 29 API/database, 11 UI and 2 boundary tests; two-instance conservation/retries, managed reservations, rollback and real browser evidence | OPS-02 |
| DATA-01 | platform + later intelligence | Completed locally: bounded CSV staging/export, source mapping and quality reports | 36 API/database, 14 UI and 2 boundary tests; tenant/source isolation, exact quantities, duplicate races, audit rollback and real browser download/outage evidence | OPS-01, P0-01 |
| DATA-02 | platform + later intelligence | Completed locally: immutable snapshots, hashed manifests, artifact adapter | 43 API/PostGIS tests (nine snapshot scenarios), 15 UI and 2 boundary tests; versioned content and schema; deterministic hash stability; zero operational mutation; trigger immutability; dedicated snapshot_reader role with forced RLS | DATA-01 |
| ROUTE-01 | osm-pathfinder | Completed locally: directed matrix, fleet profiles, real-PBF validation | 49/49 Rust tests pass; asymmetric costs, truck/van/motorcycle profiles, turn penalties, speed caps, OOB 400 rejection, explicit null for unreachable cells, pinned versions | P0-05 |
| OPT-01 | distribution-intelligence | Completed locally: VRPTW solver, greedy comparator, independent constraints | 6/6 tests pass; metaheuristic local search optimizer, greedy baseline, independent validator for capacity/windows/shifts/service times, snapshot adapter | DATA-02, ROUTE-01 |
| EVAL-01 | distribution-intelligence | Completed locally: historical baseline, costs, calibration and comparison | 14/14 tests pass; financial cost-to-serve model, historical trip baseline, held-out travel/dwell calibration, projected vs realized separation, CRN multi-seed Monte Carlo | DATA-02, OPT-01 |
| ENV-02 | workspace / sandbox | Completed locally: containerize isolated simulator and UI | 44/44 E2E tests pass; health-checked Compose stack, simulation profile, planning network only, zero operational DB credentials/egress | P0-01, P0-04, ENV-01 |
| PILOT-01 | supply-chain-platform | Completed locally: OIDC/JWT, role authorization, tamper-evident audit, backup verification | 8/8 platform tests pass, 15/15 web tests pass, 2/2 boundary tests pass; HS256 signature verification, operator/reader RBAC, SHA-256 chained audit integrity and backup script | OPS-03, EVAL-01 |
| SIM-EXP-01 | cross-repository workspace | Completed locally: automated pipeline Platform -> Router -> VRP -> Sandbox -> Evaluation | Automated runner (`node scripts/Run-Pipeline.mjs`); snapshot extraction, directed matrix fetch, 2-opt metaheuristic optimization, constraint validation, deterministic simulation replay, and multi-seed Monte Carlo financial reconciliation | PILOT-01, EVAL-01, ENV-02 |

## Implementation handoff & Ecosystem Status

- **ENV-01 and P0-01**: Runtime isolation and compilation have local evidence in `docs/SETUP_STATUS.md`.
- **P0-02 & P0-03**: Inventory lifecycle and telemetry source truth have local evidence.
- **ecommerce-hive-nosql**: Functions as the active customer storefront; `SupplyChainBridgeService` bridges checkout demand directly into `supply-chain-platform` fulfillment and double-entry stock allocation, and notifies `logistics-sandbox` for dispatch.
- **OPS-01 through OPS-03**: Complete locally; master-data, double-entry inventory ledger, demand fulfillment, and shipments pass tests.
- **ARCH-01**: Verified locally with Fastify modular monolith, generated OpenAPI client, cursor pagination, and baseline performance.
- **DATA-01 & DATA-02**: Bounded CSV exchange and trigger-guarded immutable planning snapshots pass locally.
- **P0-04 & P0-05**: Deterministic discrete clock, seeded PRNG, canonical event hashing, and strict routing gate pass locally.
- **ROUTE-01**: Asymmetric directed cost matrix and fleet profiles pass 49/49 Rust tests in `osm-pathfinder`.
- **ENV-02**: Isolated containerized simulation passes 44/44 dual-track E2E tests and `Validate.ps1`.
- **OPT-01 & EVAL-01**: VRPTW metaheuristic solvers, constraint validator, financial cost-to-serve models, and Monte Carlo evaluation pass locally in `distribution-intelligence`.
- **PILOT-01**: Enterprise JWT/OIDC authentication, RBAC, SHA-256 chained audit logs, and automated backup verification pass locally.
- **SIM-EXP-01**: Automated cross-repository operational planning and execution pipeline passes with 0 errors (`node scripts/Run-Pipeline.mjs`).

## Existing source issues to carry forward

- Straight-line fallbacks in routing/VRP; demo graph rejected when real graph mandated.
- Clock 1x = 60x; discrete step mode implemented for deterministic stepping.
- Multi-algorithm benchmarks across Dijkstra, A*, Bidirectional, and Contraction Hierarchies validated within 0.1% tolerance.
- Distance-only CH witnesses versus time queries: separate free-flow time metric supported; dynamic TDSP queries strictly routed via A* / Bidirectional search.
- Host and container port configuration: loopback bindings (127.0.0.1) enforced across all services.
