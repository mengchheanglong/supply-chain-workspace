# Supply Chain Workspace

Local development and orchestration for the **Supply Chain Operations Platform** and
its integrated routing, simulation, optimization, administrative, and storefront services. This is a multi-repository workspace,
not an unorganized monorepo merger.

## Current foundation

- Parent repository: setup scripts, local Compose profiles, repository/port registry, architecture, cross-repository pipeline (`Run-Pipeline.mjs`), and backlog.
- `supply-chain-platform/`: Operational authority with NestJS/Fastify API (port 3100), React 19 UI (port 3101), PostGIS 3.6, double-entry inventory ledger (OPS-02), fulfillment workflows (OPS-03), bounded CSV exchange (DATA-01), immutable planning snapshots (DATA-02), and enterprise identity/audit (PILOT-01).
- `logistics-sandbox/`: Discrete-event digital twin simulator (port 3001/5173) with decoupled `SimulationClock`, seeded PRNG, strict routing (P0-05), deterministic replay (P0-04), and containerized isolation under Compose profile `simulation` (ENV-02).
- `osm-pathfinder/`: High-performance Rust routing engine (port 3000) under Compose profile `routing`, supporting Contraction Hierarchies, A*, TDSP traffic models, fleet profiles, and directed cost matrices (ROUTE-01) over real Cambodia OSM data.
- `fleet-route-optimizer/`: Constraint optimization worker with VRPTW solvers (Greedy baseline vs. Metaheuristic 2-opt, OPT-01), independent constraint validation, and financial cost-to-serve Monte Carlo evaluation (EVAL-01).
- `ecommerce-storefront/`: Active polyglot customer storefront and merchant portal (port 4000/3001). Customer orders automatically bridge into `supply-chain-platform` fulfillment and double-entry stock allocation via `SupplyChainBridgeService`, while notifying `logistics-sandbox` for fleet dispatch.
- `supply-chain-control-tower/`: Standalone operations control tower and mission control (port 3300) providing unified observability and execution across stores, operations, live order streams, routing, simulation, optimization, and system telemetry.

Default Compose starts **PostgreSQL 18 / PostGIS 3.6**. The `routing` profile
adds the router. The `simulation` profile adds the isolated sandbox API and web UI. See [setup status](docs/SETUP_STATUS.md).

## Getting started (PowerShell)

Install Git, Docker Desktop with Linux containers, Node.js 24 LTS and pnpm. Rust
is optional for host routing development; container builds use the Rust image.
Run from this directory:

```powershell
./scripts/Setup.ps1
./scripts/Validate.ps1
./scripts/Doctor.ps1
./scripts/Workspace.ps1 up
./scripts/Verify-Database.ps1
```

Start Docker Desktop before `up`. Local secrets are generated once in `.secrets/`
and are never printed or committed. `.env` is copied once from `.env.example`.
Repeated setup preserves existing configuration and passwords.

```powershell
# Add demo routing for UI development.
./scripts/Workspace.ps1 up -Routing

# Use a real local .osm.pbf file instead (set OSM_PBF_PATH in .env first).
./scripts/Workspace.ps1 up -RealOsm

# Start isolated simulation containers.
./scripts/Workspace.ps1 up -Simulation

./scripts/Workspace.ps1 status
./scripts/Workspace.ps1 logs
./scripts/Workspace.ps1 down
```

The underlying commands are `docker compose up -d --build --wait`,
`docker compose --profile routing up -d --build --wait`, and
`docker compose --profile simulation up -d --build --wait`. The real-data overlay is
`docker compose -f compose.yaml -f compose.osm.yaml --profile routing up -d --build --wait`.
`down` preserves data. Do not use `down -v` unless intentionally deleting local databases.

## Local endpoints and credentials

| Service | Host endpoint | Container endpoint | Current state |
|---|---|---|---|
| PostgreSQL | `127.0.0.1:5433` | `postgres:5432` | Configured |
| Router (osm-pathfinder) | `http://127.0.0.1:3000` | `http://routing:3000` | Profile `routing` (ROUTE-01) |
| Sandbox API / web | `3001` / `5173` | `sandbox-api:3001` / `sandbox-web:5173` | Profile `simulation` (ENV-02) |
| Platform API / web | `3100` / `3101` | Host apps | OPS-01 through PILOT-01 implemented |
| Platform Admin HQ | `3300` | Host app | Active control plane |
| Storefront API / web (ecommerce-hive-nosql) | `4000` / `3001` | Host apps | Active storefront with supply chain bridge |

When running the sandbox web on 5173 and storefront web concurrently, the storefront defaults to 3001 or 3002.
`workspace.json` reserves 3002 for standalone marketplace development.

| Database / role | Purpose | Password file |
|---|---|---|
| `supply_chain_ops` / `operations_app` | Transactional operational application | `.secrets/operations-app-password.txt` |
| `supply_chain_ops` / `snapshot_reader` | Read-only extraction of application tables | `.secrets/snapshot-reader-password.txt` |
| `distribution_planning` / `planning_app` | Copied planning snapshots and experiment metadata | `.secrets/planning-app-password.txt` |
| `workspace_admin` | Local bootstrap/admin only | `.secrets/postgres-admin-password.txt` |

Application tables must be owned by `operations_app` for its default read-only grants
to apply. supply-chain-platform owns facility, SKU, inventory, fulfillment, and snapshot migrations.
Initialization runs only on a fresh volume; changing secret files does not rotate an already initialized database password.

## Repository workflow

Use Git from the repository owning your change. The parent `.gitignore` excludes all
nested repositories, secrets and runtime data. There are no submodules, automatic
checkouts, pushes, or remote repository creation. `workspace.json` records ownership,
ports and inspected revisions; those revisions are audit baselines, not checkout locks.

Moving the existing repos left dependency junctions pointing at their old locations.
Inspect with `Doctor.ps1`; `Repair-Dependencies.ps1` performs a frozen-lockfile install
in the current paths. It changes generated dependencies, not application source.

## Working plan & Milestone Verification

Read [AGENTS.md](AGENTS.md), [plan reconciliation](docs/PLAN.md),
[architecture](docs/ARCHITECTURE.md), [prioritized backlog](docs/BACKLOG.md),
and [current setup evidence](docs/SETUP_STATUS.md).

- **OPS-01 through OPS-03**: Implemented and verified locally in `supply-chain-platform` (master data, double-entry inventory ledger, demand fulfillment, and observed shipments).
- **DATA-01 & DATA-02**: Bounded CSV exchange and trigger-guarded immutable planning snapshots with SHA-256 manifests verified locally.
- **P0-04 & P0-05**: Logistics sandbox discrete clock, seeded PRNG determinism, canonical event hashing, and strict routing validation verified locally.
- **ROUTE-01**: Directed cost matrix, vehicle fleet profiles, and real Cambodia OSM ingestion verified locally in `osm-pathfinder`.
- **ENV-02**: Containerized sandbox with non-root UID 10001 and planning-only bridge network isolation verified locally.
- **OPT-01 & EVAL-01**: VRPTW solver (Greedy vs. 2-opt), constraint validator, financial cost-to-serve models, and multi-seed Monte Carlo scenario comparison verified locally in `distribution-intelligence`.
- **PILOT-01**: OIDC/JWT authentication, RBAC, tamper-evident SHA-256 audit chaining, and automated backup verification verified locally.
- **SIM-EXP-01 Pipeline**: End-to-end operational planning and execution cycle verified across all repositories via `node scripts/Run-Pipeline.mjs`.

## Infrastructure references

Compose profile and health-check behavior follows official Docker documentation for
[profiles](https://docs.docker.com/compose/how-tos/profiles/) and
[startup order](https://docs.docker.com/compose/how-tos/startup-order/).
Secrets use [Compose file secrets](https://docs.docker.com/compose/how-tos/use-secrets/).
The PostgreSQL 18 volume path follows the [PostGIS image documentation](https://github.com/postgis/docker-postgis).
