# Adopted plan and scope reconciliation

Date: 2026-10-10. Sources: Workspace development, verified milestones, and live code topology.

## What the latest plan establishes

The workspace coordinates the **Supply Chain Operations Platform** (`supply-chain-platform`),
owning warehouse, inventory, fulfillment, and distribution operations.
- Physical road graph routing is owned by `osm-pathfinder`.
- Discrete-event simulation and replay are owned by `logistics-sandbox`.
- Mathematical optimization (VRPTW) and financial cost evaluation are owned by `distribution-intelligence`.
- The commercial customer-facing storefront and order intake gateway are owned by `ecommerce-hive-nosql`.
- The centralized operations control tower and ecosystem cockpit is owned by `supply-chain-control-tower`.

This architecture preserves clear domain boundaries while enabling end-to-end integration:
customer storefront orders generate fulfillment demand and allocate double-entry inventory ledger stock,
read-only snapshots feed solvers and simulation twins, and routing engines supply directed road costs.

## First scope & Completed Milestones

### Accepted clarification and current state

`supply-chain-platform` is the operational warehouse/distribution authority.
`ecommerce-hive-nosql` functions as the commercial storefront and customer demand gateway,
bridged into `supply-chain-platform` via `SupplyChainBridgeService`.

All Phase 0 through Pilot milestones are implemented and verified locally:
1. **P0-01 through P0-03**: Isolation boundaries, transactional inventory holds, and truthful telemetry fixtures.
2. **OPS-01 through OPS-03**: Multi-tenant master data, double-entry inventory ledger, demand fulfillment, and shipments.
3. **ARCH-01**: Modular Fastify monolith, generated OpenAPI client, cursor pagination, and boundary enforcement.
4. **DATA-01 & DATA-02**: Bounded CSV exchange and trigger-guarded immutable planning snapshots with SHA-256 manifests.
5. **ROUTE-01 & P0-05**: Asymmetric directed cost matrix, vehicle fleet profiles, and real Cambodia OSM graph ingestion.
6. **P0-04 & ENV-02**: Discrete simulation clock, seeded PRNG determinism, and isolated containerized sandbox.
7. **OPT-01 & EVAL-01**: Metaheuristic VRPTW solvers, constraint validation, financial cost-to-serve models, and Monte Carlo scenario comparison.
8. **PILOT-01**: Enterprise JWT/OIDC authentication, RBAC, SHA-256 chained audit logs, and automated backup verification.
9. **SIM-EXP-01 Pipeline**: End-to-end automated cycle connecting Platform -> Router -> Solver -> Sandbox -> Evaluation.

## Reuse decision

- Reuse the router as an independent service over typed HTTP contracts, not copied Rust code.
- Reuse/refactor simulation into an isolated deterministic worker, not operational authority.
- Storefront demand bridges to platform fulfillment via typed API contracts, preserving double-entry ledger allocation.
- PostgreSQL 18 / PostGIS 3.6 is the operational store; application-owned migrations 001–005 are applied and checksummed.
- Immutable snapshots use cryptographic SHA-256 digests and PostgreSQL trigger protection.
- Metaheuristic local search and greedy baselines provide independent solver capabilities.

## Authorization and evidence

All implemented functionality is accompanied by reproducible test evidence recorded in `docs/SETUP_STATUS.md`.
Live databases, router images, and container stacks run on loopback ports in local development.
Remote repository creation, public pushes, or production deployments remain subject to user authorization.
