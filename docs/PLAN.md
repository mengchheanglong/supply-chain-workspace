# Adopted plan and scope reconciliation

Date: 2026-10-08. Sources: the three supplied conversations and the enterprise blueprint.

## What the latest plan establishes

The latest naming/workspace conversation chooses **supply-chain-platform** with the
product description **Supply Chain Operations Platform**. It owns warehouse, inventory,
fulfillment and distribution operations. The workspace is independently versioned and
orchestrates separate repositories. Existing routing remains in osm-pathfinder.

The earlier enterprise blueprint proposes an integration-first **decision platform**
and explicitly excludes full WMS replacement. Both tracks remain useful when kept
separate: the new operations application is bounded, while the later intelligence layer
consumes read-only snapshots from it or incumbent ERP/WMS/TMS systems.
This setup adopts the later repository boundary without broadening the first release
to procurement, manufacturing, global freight or a complete ERP.

## First scope

### Accepted clarification and current handoff

The user reaffirmed that supply-chain-platform is the warehouse/distribution successor.
ecommerce-hive-nosql is retired as an e-commerce reference; its final e-commerce maintenance
was explicitly authorized for main and pushed as 7a5ba5388a4d218bd6ad42e400280a104e364131.
New operational functionality belongs to supply-chain-platform. OPS-01 is implemented
locally. The user requested architecture selection before further building: platform
ADR-0003 adopts Nest/Fastify, PostgreSQL/PostGIS, React/Vite and explicit domain/worker
boundaries. ARCH-01, OPS-02 inventory, OPS-03 fulfillment and DATA-01 bounded exchange are
verified locally; DATA-02 approved immutable snapshots are next. Phase 0
simulator gates continue separately before any production-data simulation integration.

1. Make existing simulation and integration outputs trustworthy (Phase 0).
2. Build a small operations foundation: organizations, facilities, SKUs, inventory ledger,
   reservations, receiving and fulfillment/shipment states.
3. Export/read/import versioned operational snapshots with validation and lineage.
4. Reconstruct historical baselines and explicit cost/service metrics.
5. Add independent constraint optimization and scenario comparison after their prerequisites.

## Reuse decision

- Reuse the router as a service, not copied Rust code.
- Reuse/refactor simulation into an isolated deterministic worker, not operational authority.
- Review e-commerce DTO/controller patterns and UI primitives selectively. Its browser
  carts, demo login/payments, referral fixtures, telemetry claims and inventory updates
  are not the new platform's foundations.
- PostgreSQL/PostGIS is the first operational store; application-owned migrations follow.
- Object storage is a future adapter for immutable datasets/run artifacts. An ignored
  local artifact directory is prepared now; no S3 service or immutability guarantee exists yet.
- Redis, Cassandra, Neo4j and analytics infrastructure require workload evidence.
- OR-Tools is the proposed first solver; implementation and benchmarks are pending.

## Authorization and evidence

The current request authorizes setup. The preserved documents contain prior prompts,
research, proposed PR names and implementation instructions; these are reference material.
They do not authorize contacting customers, creating remote repositories, publishing,
deploying to production or executing the entire backlog.

All new application/worker functionality remains planned until implemented and tested.
Blueprint time estimates and savings are hypotheses, not commitments or observed outcomes.
