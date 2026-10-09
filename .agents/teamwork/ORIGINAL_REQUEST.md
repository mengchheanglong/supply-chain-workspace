# Original User Request

## 2026-10-09T10:45:00Z

Implement the dependency-ordered backlog candidates across the supply-chain-workspace: P0-04 (simulation determinism and replay in logistics-sandbox), ROUTE-01 (directed routing matrix and profiles in osm-pathfinder), and ENV-02 (containerized isolated simulator and egress controls in root compose).

Working directory: c:\Users\User\study-workspace\supply-chain-workspace
Integrity mode: development

## Requirements

### R1. P0-04 — Simulation Determinism, Injected Clock/RNG, and Replay (logistics-sandbox)
Implement deterministic simulation replay in `logistics-sandbox`:
- Injected simulation clock and seeded random number generation (RNG); eliminate all unseeded math/random calls and real wall-clock dependencies during simulation runs.
- Fixed deterministic event ordering and dispatch queue processing: eliminate order-import and dispatch completion races.
- Pause and reset controls: pausing must freeze all movement and vehicle updates; reset must restore a clean initial state.
- Canonical event hashing: identical frozen inputs and seed must produce identical canonical event sequence hashes across repeat runs.

### R2. ROUTE-01 — Directed Routing Matrices and Profiles (osm-pathfinder)
Implement directed routing matrix and vehicle profile routing in `osm-pathfinder`:
- Directed cost matrix computation (duration and distance) supporting asymmetric forward/reverse network costs.
- Fleet vehicle profiles (e.g. truck, van, motorcycle) respecting physical turn, road class, and speed limits.
- Real-PBF road graph validation and geometry extraction without fallback to unverified straight lines.
- Pinned graph and cost model versioning in responses.

### R3. ENV-02 — Isolated Simulator Containerization and Network Egress Controls (workspace / sandbox)
Containerize the logistics sandbox and configure network isolation in `compose.yaml`:
- Containerize `logistics-sandbox` backend and frontend with Dockerfiles and Compose service definitions.
- Health-checked Compose stack with proper host/container service URLs.
- Operational database isolation: simulation containers must NOT have write credentials to operational PostgreSQL or operational platform endpoints.
- Maintain workspace scripts (`scripts/Validate.ps1`, `scripts/Setup.ps1`, `scripts/Workspace.ps1`).

## Acceptance Criteria

### P0-04 Determinism & Replay
- [ ] Injected clock coordinates all ticks; pausing immediately halts vehicle movements and state updates.
- [ ] Seeded RNG ensures deterministic events across identical input payloads.
- [ ] Replay test demonstrates identical canonical event sequence SHA-256 hashes for repeated runs with identical seeds.
- [ ] Reset restores simulator to clean zero-state without orphaned deliveries or vehicles.
- [ ] All `logistics-sandbox` unit and integration tests pass.

### ROUTE-01 Routing Matrices & Validation
- [ ] Directed cost matrix endpoint returns asymmetric travel times and distances.
- [ ] Vehicle profile filters restrict access to valid road classes.
- [ ] Routing failure returns explicit error status code; never returns synthetic/unmarked straight lines.
- [ ] All `osm-pathfinder` cargo tests pass.

### ENV-02 Containerization & Isolation
- [ ] Compose definitions for sandbox backend and frontend run with health checks.
- [ ] Network egress and secret wiring verified: sandbox containers have zero operational write access.
- [ ] `./scripts/Validate.ps1` passes with all container and network boundaries intact.
- [ ] Root `docs/BACKLOG.md` and `docs/SETUP_STATUS.md` updated with verification evidence.
