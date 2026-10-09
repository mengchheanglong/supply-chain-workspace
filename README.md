# Supply Chain Workspace

Local development and orchestration for the **Supply Chain Operations Platform** and
its independent routing and simulation services. This is a multi-repository workspace,
not a merger of the application codebases.

## Current foundation

- Parent repository: setup scripts, local Compose, repository/port registry, architecture and backlog.
- `supply-chain-platform/`: OPS-01 API/UI, scoped credentials, facilities/SKUs and app-owned migrations implemented locally; ARCH-01 alignment verified.
- `logistics-sandbox/`: existing simulator; upstream writes disabled with local regression evidence; further Phase 0 correctness work is pending.
- `osm-pathfinder/`: existing router; optional container uses the demo graph unless real data is explicitly selected.
- `ecommerce-hive-nosql/`: retired e-commerce reference; final maintenance pushed to main; no connection to the operational database.
- `distribution-intelligence/`: future boundary, intentionally not created yet.

Default Compose starts **PostgreSQL 18 / PostGIS 3.6 only**. The `routing` profile
adds the router. The application stack is not yet containerized by this workspace.
Legacy simulation and marketplace startup is deliberately separate until endpoint,
egress and correctness gates are implemented. See [setup status](docs/SETUP_STATUS.md).

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

./scripts/Workspace.ps1 status
./scripts/Workspace.ps1 logs
./scripts/Workspace.ps1 down
```

The underlying commands are `docker compose up -d --build --wait` and
`docker compose --profile routing up -d --build --wait`. The real-data overlay is
`docker compose -f compose.yaml -f compose.osm.yaml --profile routing up -d --build --wait`.
`down` preserves data. Do not use `down -v` unless intentionally deleting local databases.

## Local endpoints and credentials

| Service | Host endpoint | Container endpoint | Current state |
|---|---|---|---|
| PostgreSQL | `127.0.0.1:5433` | `postgres:5432` | Configured |
| Router | `http://127.0.0.1:3000` | `http://routing:3000` | Optional `routing` profile |
| Platform API / web | `3100` / `3101` | Host apps; containerization pending | OPS-01 implemented |
| Sandbox API / web | `3001` / `5173` | To be added | Existing host apps |
| Marketplace API / web | `4000` / `3002` | To be added | Reference host apps |

The marketplace currently defaults to web port 3001, conflicting with the sandbox.
Use `pnpm exec next dev -p 3002` from `ecommerce-hive-nosql/web` for standalone work.
The registry reserves 3002; it does not rewrite the marketplace's existing scripts.

| Database / role | Purpose | Password file |
|---|---|---|
| `supply_chain_ops` / `operations_app` | Future transactional application | `.secrets/operations-app-password.txt` |
| `supply_chain_ops` / `snapshot_reader` | Read-only extraction of application tables | `.secrets/snapshot-reader-password.txt` |
| `distribution_planning` / `planning_app` | Future copied snapshots and experiment metadata | `.secrets/planning-app-password.txt` |
| `workspace_admin` | Local bootstrap/admin only | `.secrets/postgres-admin-password.txt` |

Application tables must be owned by `operations_app` for its default read-only grants
to apply. New schemas require equivalent explicit grants. No business schema/migration
is installed by bootstrap. supply-chain-platform now owns facility/SKU/identity/audit
migrations and tested master-data tenant policies. Snapshot extraction and production
tenant authorization remain separate gates.
The database names are fixed by the bootstrap. Initialization runs only on a fresh volume;
changing secret files does not rotate an already initialized database password.

## Repository workflow

Use Git from the repository owning your change. The parent `.gitignore` excludes all
nested repositories, secrets and runtime data. There are no submodules, automatic
checkouts, pushes, or remote repository creation. `workspace.json` records ownership,
ports and inspected revisions; those revisions are audit baselines, not checkout locks.

Moving the existing repos left dependency junctions pointing at their old locations.
Inspect with `Doctor.ps1`; `Repair-Dependencies.ps1` performs a frozen-lockfile install
in the current paths. It changes generated dependencies, not application source.

## Working plan

Read [AGENTS.md](AGENTS.md), [plan reconciliation](docs/PLAN.md),
[architecture](docs/ARCHITECTURE.md), [prioritized backlog](docs/BACKLOG.md),
[current setup evidence](docs/SETUP_STATUS.md), and the
[new platform README](supply-chain-platform/README.md).

Simulation egress isolation, marketplace maintenance and platform OPS-01 have local
evidence. The [platform architecture](supply-chain-platform/docs/ARCHITECTURE.md) is now
selected. ARCH-01 is now verified locally with domain boundaries, Fastify,
generated HTTP contracts, scoped frontend state and pagination. OPS-03 fulfillment/shipping
now passes locally; see [workflow evidence](supply-chain-platform/docs/FULFILLMENT_VERIFICATION.md).
DATA-01 bounded CSV staging/export also passes locally; see
[exchange evidence](supply-chain-platform/docs/DATA_EXCHANGE_VERIFICATION.md).
Main development next implements DATA-02 approved immutable planning snapshots.
OPS-02 inventory/reservations also pass locally;
see [inventory evidence](supply-chain-platform/docs/INVENTORY_VERIFICATION.md). Simulator determinism/routing remain independent prerequisites
for later planning integration. Approved immutable snapshots remain pending.

The supplied blueprint is preserved verbatim in [docs/reference](docs/reference/README.md).
Its market claims and older source audit are historical proposals, not current test results.

## Infrastructure references

Compose profile and health-check behavior follows the official
[profiles](https://docs.docker.com/compose/how-tos/profiles/) and
[startup order](https://docs.docker.com/compose/how-tos/startup-order/) documentation.
Secrets use [Compose file secrets](https://docs.docker.com/compose/how-tos/use-secrets/).
The PostgreSQL 18 volume path follows the [PostGIS image documentation](https://github.com/postgis/docker-postgis).
