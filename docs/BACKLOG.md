# Dependency-ordered implementation backlog

ENV-01 and P0-01 through P0-03 are completed locally; other items remain pending.
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

## First implementation handoff

ENV-01 and the P0-01 runtime boundary have local evidence in docs/SETUP_STATUS.md.
P0-02 inventory lifecycle and P0-03 telemetry source truth now have local evidence as well.
The retired marketplace's final maintenance is pushed to main (7a5ba53); no warehouse
features will be implemented there. OPS-01 is now complete locally.
ARCH-01 now passes locally: 12 API/database, 6 frontend and 2 boundary tests, real browser
workflows and a 900-request load baseline; see platform/docs/ARCHITECTURE_VERIFICATION.md.
OPS-02 now passes locally; see platform/docs/INVENTORY_VERIFICATION.md.
OPS-03 now passes locally; see platform/docs/FULFILLMENT_VERIFICATION.md.
DATA-01 now passes locally; see platform/docs/DATA_EXCHANGE_VERIFICATION.md.
DATA-02 now passes locally; see platform/docs/DATA_EXCHANGE_VERIFICATION.md.
P0-04 now passes locally (21/21 determinism tests, 76/76 sandbox tests); see docs/SETUP_STATUS.md.
ROUTE-01 now passes locally (49/49 Rust tests in osm-pathfinder); see docs/SETUP_STATUS.md.
ENV-02 now passes locally (44/44 dual-track E2E tests, Validate.ps1 passes); see docs/SETUP_STATUS.md.
P0-05 now passes locally (51/51 Rust tests, 83/83 sandbox backend tests); see docs/SETUP_STATUS.md.
OPT-01 now passes locally (6/6 tests in distribution-intelligence); see docs/SETUP_STATUS.md.
EVAL-01 now passes locally (14/14 tests in distribution-intelligence); see docs/SETUP_STATUS.md.
PILOT-01 now passes locally (8 platform tests, 15 web tests, 2 boundary tests, Verify-Backup.ps1); see docs/SETUP_STATUS.md.


## Existing source issues to carry forward

- Straight-line fallbacks in routing/VRP; demo graph silently accepted.
- Clock 1x = 60x; pause does not guard movement; raw ETA versus clamped movement duration.
- Unseeded chaos/address randomness; RNG/reset and asynchronous completion races.
  Reproduced: importing orders during a single-order dispatch can shift the wrong
  queue entry and strand an imported order. Resolve and regress under P0-04.
- Event history is unbounded notifications, not a replayable event-sourced record.
- Inventory double deduction corrected by P0-01/P0-02; legacy reservation reconciliation remains explicit.
- Telemetry source claims corrected by P0-03; unrelated fixture analytics still need source labelling.
- Distance-only CH witnesses while time queries are offered; turn-dependent labels and
  bidirectional dynamic costs need supported-domain tests.
- Legacy configuration defaults to localhost, and web defaults conflict on port 3001.

These are source-inspection findings. Runtime reproduction/independent tests belong to
the corresponding task; no gate is marked achieved by this checklist.
