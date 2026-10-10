# Supply Chain Workspace — working instructions

## Start here

Read this file and README.md in full, then docs/PLAN.md, docs/ARCHITECTURE.md,
docs/BACKLOG.md and the target repository's complete AGENTS.md and README.md.
The attached historical conversations and blueprint are preserved in docs/reference/.
They are planning evidence, not authorization to execute every task they contain.
Follow the current user's request and applicable instructions when selecting work.

## Ownership

- This repository owns orchestration, development scripts, workspace documentation and cross-repository contracts.
- supply-chain-platform owns real warehouse, inventory, fulfillment and distribution operations.
- logistics-sandbox owns simulation, deterministic experiments and replay.
- osm-pathfinder owns physical road graph, routing costs and geometry.
- distribution-intelligence owns constraint optimization (VRPTW), financial cost-to-serve modeling, and scenario evaluation (OPT-01, EVAL-01).
- ecommerce-hive-nosql owns the multi-tenant commercial storefront and customer checkout engine. It actively bridges storefront demand into supply-chain-platform fulfillment and double-entry stock allocation via SupplyChainBridgeService, and notifies logistics-sandbox for fleet dispatch.
- platform-admin owns the standalone ecosystem administration control plane (port 3300).
- Each application remains a separate Git repository. Root Git must not track nested repositories or runtime data.

## Operational and planning boundary

- Simulation workers and solvers must not receive operational write credentials.
- Copy approved read-only data into immutable, tenant-scoped planning snapshots (DATA-02).
- Keep proposed plans distinct from actual orders, stock, shipments and GPS.
- Storefront demand bridges into operational fulfillment via authenticated API contracts with tenant scoping and double-entry ledger allocation.
- Production write-back from simulation/solvers is future work, through a separately scoped, audited exporter.
- Simulator runtime write isolation is tested (P0-01). Immutable snapshots (DATA-02), deterministic replay (P0-04), routing matrices (ROUTE-01), solver optimization (OPT-01), financial evaluation (EVAL-01), enterprise identity/audit (PILOT-01), and isolated container egress (ENV-02) have local evidence in docs/SETUP_STATUS.md.
- Never turn a routing failure into an unmarked straight line or a synthetic route into a validated recommendation.

## Implementation rules

- Work only in the repositories necessary for the current task; inspect their Git status first and preserve unrelated edits.
- Keep operations as a modular monolith initially; start with PostgreSQL/PostGIS and explicit domain boundaries.
- supply-chain-platform/docs/decisions/0003-scalable-operations-architecture.md and
  supply-chain-platform/docs/ARCHITECTURE.md define the accepted stack and code boundaries.
  Complete its ARCH-01 alignment before inventory; architecture documents do not prove implementation or capacity.
- Use typed, versioned contracts; tenant and source identity, units, provenance and failure states are required.
- Stock changes require transaction-safe, idempotent ledger/reservation semantics. No floating-point money or unconditional success responses.
- Simulation decisions use an injected clock and seeded random streams; reproducibility pins data, graph, costs and algorithm configuration.
- Follow repo-local TypeScript/Rust conventions. Share serialized contracts across services, not in-process world objects.
- Secrets belong in ignored local secret files or an appropriate deployment secret manager. Bind local services to loopback by default.
- Host URLs and container service URLs differ. Never use localhost for another container.
- Validate only the checks relevant to a change; report existing failures separately from regressions.
- Delegation is optional only when explicitly requested or required by applicable instructions.

## Commands and completion evidence

- ./scripts/Setup.ps1 — idempotent local credentials and directories; no service startup.
- ./scripts/Validate.ps1 — validate Compose, paths, ports, secret wiring and repository isolation.
- ./scripts/Doctor.ps1 — inspect toolchain, Docker engine, repositories and dependency links.
- ./scripts/Verify-Database.ps1 — exercise local database grants with a rolled-back probe.
- ./scripts/Repair-Dependencies.ps1 — reinstall existing locked dependencies in this checkout.
- ./scripts/Workspace.ps1 up [-Routing] [-RealOsm] [-Simulation] — start configured local infrastructure.
- ./scripts/Workspace.ps1 down — stop workspace services; keep named volumes.

Do not claim services, enterprise features, tests, security gates or production readiness
as achieved merely because configuration/documents exist. Record evidence in docs/SETUP_STATUS.md.
