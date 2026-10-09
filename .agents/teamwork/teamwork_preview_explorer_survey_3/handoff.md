# Survey & Exploration Report: R3. ENV-02 — Isolated Simulator Containerization and Network Egress Controls

**Agent:** `teamwork_preview_explorer_survey_3`  
**Date:** 2026-10-09  
**Target:** R3. ENV-02 (Workspace Orchestration & Logistics Sandbox)  
**Status:** Survey Complete — Actionable Implementation Blueprint Produced  

---

## 1. Observation

### 1.1 Root Configuration and Orchestration
- **`compose.yaml` (lines 3–58, 72–77):**
  - Defines two services currently: `postgres` (on network `operations`, port `127.0.0.1:${POSTGRES_HOST_PORT:-5433}:5432`) and `routing` (profile `routing`, network `planning`, port `127.0.0.1:${ROUTING_HOST_PORT:-3000}:3000`, built via `context: ./osm-pathfinder`, `dockerfile: ../infrastructure/routing/Dockerfile`).
  - Defines two isolated bridge networks: `operations` and `planning`.
  - Defines four file secrets: `postgres_admin_password`, `operations_app_password`, `planning_app_password`, `snapshot_reader_password`. All four are attached only to `postgres`. `routing` has zero secrets.
- **`workspace.json` (lines 12–21):**
  - Registers reserved host ports:
    - `"routing": 3000`
    - `"sandboxApi": 3001`
    - `"marketplaceWeb": 3002`
    - `"platformApi": 3100`
    - `"platformWeb": 3101`
    - `"marketplaceApi": 4000`
    - `"postgres": 5433`
    - `"sandboxWeb": 5173`
- **`scripts/Validate.ps1` (lines 9–60):**
  - Line 9 checks presence of critical files: `'AGENTS.md', 'README.md', 'workspace.json', 'docs/PLAN.md', 'docs/ARCHITECTURE.md', 'docs/BACKLOG.md', 'docs/SETUP_STATUS.md', 'compose.yaml', 'compose.osm.yaml', 'osm-pathfinder/Cargo.lock', 'infrastructure/routing/Dockerfile'`.
  - Line 33 strictly checks: `Assert-Condition (@($config.services.PSObject.Properties).Count -eq 2) 'Unexpected service enabled in initial workspace.'`.
  - Lines 37–40 assert that `routing` receives no database credentials, `routing` is exclusively on `planning`, `postgres` is exclusively on `operations`, and both networks use the `bridge` driver.
  - Lines 42–49 iterate over all services in the parsed Compose config and assert that every published port binds to `127.0.0.1` and has no collisions.
- **`scripts/Workspace.ps1` (lines 5–8, 30):**
  - Takes parameters: `Action` ('up', 'down', 'status', 'logs', 'validate'), `[switch]$Routing`, `[switch]$RealOsm`.
  - Line 30 adds `--profile routing` when `$Routing` or `$RealOsm` is set.
  - Currently has no parameter for the simulation stack (e.g. `[switch]$Simulation`).
- **`scripts/Setup.ps1` (lines 19–27):**
  - Generates passwords for `postgres-admin`, `operations-app`, `planning-app`, and `snapshot-reader`.
  - Does not generate passwords for simulation components (by design).
- **`scripts/Verify-Database.ps1` (lines 9–37):**
  - Confirms role separation on PostgreSQL: `operations_app` cannot connect to `distribution_planning`; `planning_app` cannot connect to `supply_chain_ops`; `snapshot_reader` is read-only.
- **`docs/ARCHITECTURE.md` (lines 83–94):**
  - States: *"Adding the legacy simulator to Compose: Before adding it, implement endpoint configuration, disable upstream writes by default, fix source compilation failures, and verify runtime pause/clock behavior. Provide ROUTING_BASE_URL=http://routing:3000, separate read/write adapters, an explicit disabled egress policy and in-memory/planning-only persistence... Add frontend proxy configuration for the backend's service name. Add health checks and service_healthy dependencies, contract tests, and no operations database secrets. A simulation profile can then be introduced with an actual isolated runnable stack."*

### 1.2 Logistics Sandbox Current Codebase State
- **Monorepo Structure:**
  - `logistics-sandbox/package.json` defines root pnpm workspace with `backend` and `frontend`.
  - `pnpm-lock.yaml` is lockfileVersion `9.0` (matching host pnpm `10.32.1`).
  - No existing Dockerfiles or `.dockerignore` files exist in `logistics-sandbox/` or `infrastructure/sandbox/`.
- **Backend (`logistics-sandbox/backend`):**
  - `package.json`: type `module`, scripts include `"build": "tsc"`, `"start": "node dist/index.js"`.
  - Runtime dependencies: `cors (^2.8.5)`, `express (^4.18.2)`, `uuid (^9.0.1)`, `ws (^8.16.0)`.
  - Verified: `pnpm --filter @logistics-sandbox/backend build` exits code `0`.
  - Verified: `pnpm --filter @logistics-sandbox/backend test` passes **10 test files / 55 tests** in 1.61s.
  - `src/index.ts` lines 30–35:
    ```typescript
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => { ... });
    ```
    Listens on `PORT` (default 3001).
  - `src/api/routes.ts` lines 12–14:
    ```typescript
    router.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    ```
    Provides a built-in health check endpoint returning `{ status: 'ok' }` at `http://127.0.0.1:3001/api/health`.
  - `src/routing/client.ts` line 43:
    ```typescript
    constructor(baseUrl: string = 'http://localhost:3000') {
      this.baseUrl = baseUrl;
    }
    ```
  - `src/simulation/engine.ts` line 189:
    ```typescript
    this.routingClient = new RoutingClient();
    ```
    **Critical Observation:** `RoutingClient` accepts `baseUrl`, but `engine.ts` instantiates it with default arguments without reading `process.env.ROUTING_BASE_URL`.
  - `src/persistence/factory.ts` lines 14–21:
    Enforces `PERSISTENCE_DRIVER === 'in-memory'`. Throws error if any remote database driver is requested.
  - `src/integrations/ecommerce.ts` line 125:
    `EcommerceReadClient` validates that `ECOMMERCE_READ_URL` contains no user/password/query/hash.
  - `backend/tests/egress-isolation.test.ts`:
    Verifies that `/api/inventory/adjust` and `/api/graph/query` return HTTP 403 with `egressPolicy: DISABLED`.
- **Frontend (`logistics-sandbox/frontend`):**
  - `package.json`: React 18.3, MapLibre GL 4.7, deck.gl 9.1–9.4, Vite 6.0, Tailwind CSS 4.3.
  - Verified: `pnpm --filter @logistics-sandbox/frontend build` (`tsc && vite build`) exits code `0` in 46.88s, creating static bundle in `frontend/dist/`.
  - `vite.config.ts` lines 7–19:
    ```typescript
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
        },
      },
    },
    ```
    **Critical Observation:** Vite server currently hardcodes `http://localhost:3001` as proxy target and does not bind to `0.0.0.0` or expose `preview.proxy`.

---

## 2. Logic Chain

1. **Service Boundaries & Compose Profiles:**
   - From `docs/ARCHITECTURE.md` (lines 83–94) and `docs/SETUP_STATUS.md` (line 31), the simulation stack must not run by default when bootstrapping workspace infrastructure with `./scripts/Workspace.ps1 up`.
   - Adding `profiles: [simulation]` to both `sandbox-api` and `sandbox-web` ensures that the simulation services are only started when explicitly requested via `--profile simulation` (or `./scripts/Workspace.ps1 up -Simulation`).
   - Host endpoints must match `workspace.json`: `sandbox-api` maps to `127.0.0.1:3001:3001` and `sandbox-web` maps to `127.0.0.1:5173:5173`. Both must bind to `127.0.0.1` per workspace security policy.

2. **Network Egress Isolation & Operational Database Protection:**
   - `postgres` resides exclusively on the `operations` bridge network and publishes port 5433 only to host `127.0.0.1`.
   - `routing` resides on the `planning` bridge network.
   - The simulation backend (`sandbox-api`) needs network connectivity to `routing` (`http://routing:3000`) for road routing calculations, and `sandbox-web` needs network connectivity to `sandbox-api` (`http://sandbox-api:3001`).
   - By attaching `sandbox-api` and `sandbox-web` **exclusively to the `planning` bridge network**, Docker's network isolation guarantees that simulation containers cannot resolve or route packets to `postgres:5432` on the `operations` network.
   - Neither simulation service must declare any secrets under `secrets:`. Zero operational database credentials (`operations_app_password`, `postgres_admin_password`, `snapshot_reader_password`, `planning_app_password`) will be mounted or accessible in either sandbox container.
   - At the application layer, `PERSISTENCE_DRIVER=in-memory` ensures the simulation runs fully in-memory and fails closed if remote database drivers are configured.

3. **Container Service URLs vs Host URLs:**
   - Inside the container network, containers cannot reach other containers via `localhost` or `127.0.0.1` because each container has its own network namespace.
   - `sandbox-api` must receive `ROUTING_BASE_URL: http://routing:3000` (container service URL on the `planning` network).
   - In `logistics-sandbox/backend/src/simulation/engine.ts`, line 189 must be updated to pass `process.env.ROUTING_BASE_URL` to `RoutingClient`:
     `new RoutingClient(options.routingBaseUrl ?? process.env.ROUTING_BASE_URL ?? 'http://localhost:3000')`.
   - `sandbox-web` must proxy `/api` and `/ws` to `http://sandbox-api:3001` (container service URL on the `planning` network).

4. **Containerization Strategy (Dockerfiles):**
   - **Backend (`sandbox-api`):**
     - Base: `node:20-alpine` (consistent with workspace Node LTS).
     - Multi-stage build:
       - Stage 1 (`build`): Enable corepack pnpm `10.32.1`, copy workspace manifests (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, package `package.json`s), run `pnpm install --frozen-lockfile`, copy backend source and `tsconfig.json`, run `pnpm --filter @logistics-sandbox/backend run build`.
       - Stage 2 (`runtime`): Install `curl` (for healthcheck), create non-root user `sandbox`, copy compiled `dist/` and production dependencies (`pnpm install --prod --frozen-lockfile`), expose port 3001, run as user `sandbox`.
     - Health check: `curl --fail --silent http://127.0.0.1:3001/api/health`.
   - **Frontend (`sandbox-web`):**
     - Two viable architectures evaluated:
       - *Architecture A (Recommended - Nginx Reverse Proxy):* Multi-stage build. Stage 1 compiles static assets (`tsc && vite build`). Stage 2 uses `nginx:alpine` (~25MB image size, zero Node dependencies at runtime), serving `dist/` and reverse proxying `/api/` to `http://sandbox-api:3001` and `/ws` to `http://sandbox-api:3001` (WebSocket upgrade). Health check: `wget --no-verbose --tries=1 --spider http://127.0.0.1:5173/`.
       - *Architecture B (Node Runtime with Vite Preview):* Uses `node:20-alpine`, runs `pnpm exec vite preview --host 0.0.0.0 --port 5173`. Requires updating `vite.config.ts` to parameterize backend target via `process.env.BACKEND_URL` and adding `preview.proxy`.
     - Architecture A (Nginx) is recommended for production-grade robustness, security footprint, and memory efficiency (~5MB RAM vs ~100MB Node RAM). If staying purely within Node tooling without Nginx is desired by the team, Architecture B is also fully documented.

5. **Script & Validation Enhancements:**
   - `scripts/Validate.ps1`:
     - Line 33 checks service count (`Count -eq 2`). When `sandbox-api` and `sandbox-web` are added, total services across all profiles (`docker compose --profile * config`) will be 4. Line 33 must be updated to assert `@($config.services.PSObject.Properties).Count -eq 4`.
     - Add explicit assertions:
       1. `sandbox-api` and `sandbox-web` have no secrets mounted (`$null -eq $config.services.'sandbox-api'.secrets -or @($config.services.'sandbox-api'.secrets).Count -eq 0`).
       2. `sandbox-api` and `sandbox-web` reside exclusively on the `planning` network and do NOT contain `operations`.
       3. `sandbox-api` defines `ROUTING_BASE_URL: http://routing:3000` and `PERSISTENCE_DRIVER: in-memory`.
       4. `sandbox-api` and `sandbox-web` have defined healthchecks.
       5. Published ports (3001, 5173) are bound to `127.0.0.1` (already enforced by existing loop, but will now cover the new services).
       6. Both services belong to profile `simulation`.
       7. Validate required Dockerfile paths (e.g. `infrastructure/sandbox/Dockerfile.backend` or `logistics-sandbox/backend/Dockerfile`).
   - `scripts/Workspace.ps1`:
     - Add `[switch]$Simulation` (and alias `[switch]$Sandbox`) parameter.
     - When `-Simulation` is passed, append `@('--profile', 'simulation')` to Compose arguments.

---

## 3. Caveats

1. **Docker Engine Dependency:**
   - Validating Compose file parsing (`docker compose --profile * config`) only tests configuration syntax and schema. Building images and starting containers requires Docker engine to be running.
2. **Coexistence with Host Processes:**
   - Host ports `3001` and `5173` are reserved for the sandbox. If host Node processes are running `pnpm run backend` or `pnpm run frontend` on the host, running `Workspace.ps1 up -Simulation` will produce port collision errors unless the host processes are stopped first.
3. **P0-04 Determinism Prerequisite:**
   - In `docs/BACKLOG.md`, ENV-02 lists P0-04 (determinism/clock/replay) as a co-dependency. Containerizing the simulator provides network egress isolation and service runtime packaging, but deterministic event hashing and replay behavior remain in the domain of P0-04. Both are scheduled in the current sprint.
4. **osm-pathfinder Availability:**
   - If `sandbox-api` starts without `routing` (e.g. running only `-Simulation` without `-Routing`), `RoutingClient` handles connection refusal gracefully with direct fallback estimation, but full routing functionality requires both profiles (`-Routing -Simulation`).

---

## 4. Conclusion

The design for **ENV-02** is clear, self-contained, and non-disruptive to existing workspace components:

1. **Dockerfiles:**
   - Backend: `infrastructure/sandbox/Dockerfile.backend` (or `logistics-sandbox/backend/Dockerfile`) multi-stage Node 20 build producing production runner under non-root user `sandbox`.
   - Frontend: `infrastructure/sandbox/Dockerfile.frontend` (or `logistics-sandbox/frontend/Dockerfile`) multi-stage build using `nginx:alpine` with `infrastructure/sandbox/nginx.conf` (or Node preview runner).
2. **Backend Engine Patch:**
   - In `logistics-sandbox/backend/src/simulation/engine.ts:189`, pass `process.env.ROUTING_BASE_URL` to `RoutingClient`.
   - In `logistics-sandbox/backend/src/index.ts:32`, explicitly bind to `HOST: 0.0.0.0`.
3. **Compose Definitions in `compose.yaml`:**
   - Define `sandbox-api` and `sandbox-web` under profile `simulation`.
   - Place both on network `planning`.
   - Zero secrets attached to either service.
   - Bind host ports `127.0.0.1:3001` and `127.0.0.1:5173`.
   - Add health checks (`curl http://127.0.0.1:3001/api/health` and `wget http://127.0.0.1:5173/`).
   - Configure `sandbox-web` with `depends_on: { sandbox-api: { condition: service_healthy } }`.
4. **Scripts & Documentation:**
   - Update `scripts/Validate.ps1` to assert 4 services, no secrets on sandbox services, network isolation on `planning`, loopback bindings, and health checks.
   - Update `scripts/Workspace.ps1` to support `-Simulation`.
   - Update `docs/BACKLOG.md` and `docs/SETUP_STATUS.md` with completion evidence upon implementation.

---

## 5. Verification Method

To independently verify the survey findings and the subsequent implementation:

1. **Verify Backend Build and Tests:**
   ```powershell
   pnpm --filter @logistics-sandbox/backend build
   pnpm --filter @logistics-sandbox/backend test
   ```
   *Expected:* Build succeeds (`tsc` exits 0), 10 test files and 55 tests pass (including `egress-isolation.test.ts`).

2. **Verify Frontend Build:**
   ```powershell
   pnpm --filter @logistics-sandbox/frontend build
   ```
   *Expected:* Build succeeds (`tsc && vite build` exits 0), generating production assets in `frontend/dist/`.

3. **Verify Compose Configuration & Workspace Validation:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Validate.ps1
   ```
   *Expected:* Exits 0, reporting PASS for PowerShell syntax, registry, base/OSM Compose, secret files, ports, networks, and Git boundaries.

4. **Verify Database Isolation:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Verify-Database.ps1
   ```
   *Expected:* Exits 0, verifying cross-database application isolation and that no simulation user has access.

5. **Verify Stack Up and Health Check (Runtime):**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Workspace.ps1 up -Routing -Simulation
   docker compose --profile simulation ps
   ```
   *Expected:* `sandbox-api` and `sandbox-web` report `(healthy)`. Ports are bound strictly to `127.0.0.1:3001` and `127.0.0.1:5173`.
