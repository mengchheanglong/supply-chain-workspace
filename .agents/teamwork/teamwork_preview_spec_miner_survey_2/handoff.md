# Handoff Report: Survey & Specification Mining — R2. ROUTE-01 (osm-pathfinder)

**Task**: R2. ROUTE-01 — Directed Routing Matrices and Profiles (`osm-pathfinder`)  
**Investigator**: `teamwork_preview_spec_miner_survey_2`  
**Date**: 2026-10-09  
**Status**: Survey & Specification Mining Complete  

---

## 1. Observation

Direct examination of the workspace, architecture documents, build tooling, and the `osm-pathfinder` codebase revealed the following exact facts, file locations, and verbatim lines of code:

### 1.1 Current API Surface & Absence of Matrix Endpoint
- **File**: `osm-pathfinder/src/api/routes.rs` (lines 24–36)
  ```rust
  Router::new()
      .route("/api/health", get(handlers::health_check))
      .route("/api/route", post(handlers::calculate_route))
      .route(
          "/api/isochrone",
          post(handlers::calculate_isochrone).get(handlers::calculate_isochrone_get),
      )
      .route("/api/graph/stats", get(handlers::graph_stats))
      .fallback_service(ServeDir::new("frontend"))
  ```
  **Observation**: There is currently **no** `/api/matrix` route or handler in `routes.rs` or `handlers.rs`. Routing only supports single point-to-point queries (`POST /api/route`) and reachability contours (`POST /api/isochrone`).

- **File**: `osm-pathfinder/src/api/handlers.rs` (lines 20–34, 41–55, 62–115)
  - `HealthResponse` only exposes `{ status: String, version: String }`.
  - `GraphStatsResponse` only exposes `{ nodes: usize, edges: usize }`.
  - `RouteRequest` contains `start_lat`, `start_lon`, `end_lat`, `end_lon`, `algorithm`, `metric`, `departure_time`, `include_explored`. It has **no** `profile` parameter.
  - `RouteResponse` has **no** `graph_version`, `cost_model_version`, or `profile` fields.

### 1.2 Graph Representation & Missing Road Class / Vehicle Profile Information
- **File**: `osm-pathfinder/src/graph/types.rs` (lines 20–28)
  ```rust
  #[derive(Debug, Clone, Copy)]
  pub struct Edge {
      pub target: u32,
      pub distance_m: f64,
      pub duration_s: f64,
  }
  ```
  **Observation**: Edges in `RoadGraph` store solely `target`, `distance_m`, and `duration_s`. Road class tags (e.g. `highway=motorway`, `primary`, `residential`, `living_street`) are completely discarded during graph construction.

- **File**: `osm-pathfinder/src/osm/parser.rs` (lines 20–35, 59, 79–93)
  ```rust
  const HIGHWAY_SPEEDS: &[(&str, f64)] = &[
      ("motorway", 120.0),
      ("motorway_link", 80.0),
      ("trunk", 100.0),
      ("trunk_link", 60.0),
      ("primary", 80.0),
      ("primary_link", 50.0),
      ("secondary", 60.0),
      ("secondary_link", 40.0),
      ("tertiary", 50.0),
      ("tertiary_link", 30.0),
      ("unclassified", 40.0),
      ("residential", 30.0),
      ("service", 20.0),
      ("living_street", 15.0),
  ];
  ```
  In Pass 1 (lines 91): `ways.push((node_ids, is_oneway, speed));`.  
  **Observation**: The highway classification (`hw_type`) is used only for an initial speed lookup, and then dropped. The graph builder (`src/graph/builder.rs` line 84: `add_way(&mut self, node_osm_ids: &[i64], is_oneway: bool, speed_kmh: f64)`) never receives the road category. Consequently, vehicle-specific road restrictions (e.g., banning trucks from residential/living streets or motorcycles from motorways) cannot currently be evaluated.

### 1.3 Physical Turn Penalties & Speed Limits
- **File**: `osm-pathfinder/src/geo/bearing.rs` (lines 66–84)
  ```rust
  pub fn turn_penalty_seconds(turn_angle_deg: f64) -> f64 {
      let abs_angle = turn_angle_deg.abs();
      if abs_angle < 35.0 {
          0.0
      } else if abs_angle >= 135.0 {
          15.0
      } else if abs_angle < 70.0 {
          2.5
      } else if turn_angle_deg > 0.0 {
          4.0
      } else {
          8.0
      }
  }
  ```
  **Observation**: Turn penalties are hardcoded for generic car behavior (4.0s right, 8.0s left, 15.0s U-turn). There is no adjustment for vehicle profiles (e.g. agile motorcycles vs. sluggish trucks with prohibited U-turns and higher turning costs).

- **File**: `osm-pathfinder/src/traffic/mod.rs` (lines 35–37)
  ```rust
  pub const MAX_NETWORK_SPEED_MS: f64 = 120.0 / 3.6;
  ```
  **Observation**: Maximum network speed assumes 120 km/h (passenger car). Profile-specific legal maximum speed caps (e.g., heavy freight trucks capped at 80 km/h on motorways and 60 km/h on primary highways) do not exist.

### 1.4 PBF Loader Validation & Silent Demo Fallback
- **File**: `osm-pathfinder/src/main.rs` (lines 55–69)
  ```rust
  let use_demo = args.demo || args.data.as_ref().map(|p| !p.exists()).unwrap_or(true);

  let road_graph = if use_demo {
      if let Some(ref path) = args.data {
          if !path.exists() {
              warn!(
                  path = %path.display(),
                  "OSM file not found. Falling back to built-in Cambodia road network"
              );
          }
      } else {
          info!("No OSM file specified (--data). Loading built-in Cambodia highway network");
      }
      graph::create_demo_graph()
  ```
  **Observation**: If `--data <PATH>` points to a non-existent or corrupted file, the binary currently emits a warning and **silently falls back** to the 44-node built-in demo graph.
- **File**: `supply-chain-workspace/docs/BACKLOG.md` (lines 45, 58) & `AGENTS.md`:
  > "Existing source issues to carry forward: Straight-line fallbacks in routing/VRP; demo graph silently accepted."
  > "Never turn a routing failure into an unmarked straight line or a synthetic route into a validated recommendation."
  > "Router unavailable/demo/unreachable invalidates scored run."

### 1.5 Downstream Synthetic Straight-Line Fallbacks
- **File**: `logistics-sandbox/backend/src/routing/client.ts` (lines 99–103)
  ```typescript
  // Fallback: return a direct line (clearly marked as fallback)
  const fallbackDistance = haversineDistanceSimple(start, end);
  return {
    path: [[start.lon, start.lat], [end.lon, end.lat]],
    distanceM: fallbackDistance,
    durationS: fallbackDistance / (30 / 3.6),
  ```
  **Observation**: When `osm-pathfinder` returns an error or is unreachable, the sandbox client returns an unverified direct Euclidean line between endpoints.

### 1.6 Toolchain & Test Suite Status
- Running `cargo test` with default MSVC toolchain failed because `link.exe` was not in PATH:
  ```
  error: linker `link.exe` not found
  ```
- Running `rustup toolchain list` showed:
  ```
  stable-x86_64-pc-windows-gnu
  stable-x86_64-pc-windows-msvc (active, default)
  ```
- Running `cargo +stable-x86_64-pc-windows-gnu test` succeeded completely:
  - 38 library unit tests passed.
  - 2 integration tests passed (`test_end_to_end_routing_pipeline`, `test_ch_rejects_dynamic_departure_time`).
  - Total: **40 tests passed, 0 failed**.
- Running `cargo +stable-x86_64-pc-windows-gnu clippy -- -D warnings` succeeded with 0 warnings.
- Running `cargo +stable-x86_64-pc-windows-gnu fmt --check` reported pre-existing formatting diffs in `src/graph/demo.rs` (lines 33, 41, 299, 306, 317), matching `SETUP_STATUS.md`.

---

## 2. Logic Chain

1. **Matrix Endpoint Requirement**:
   - `ORIGINAL_REQUEST.md` R2 specifies: *"Directed cost matrix computation (duration and distance) supporting asymmetric forward/reverse network costs."*
   - Acceptance Criteria state: *"Directed cost matrix endpoint returns asymmetric travel times and distances."*
   - Currently, `osm-pathfinder` has no matrix endpoint (Section 1.1). Clients (`logistics-sandbox/backend/src/dispatch/vrp.ts`) either loop through `/api/route` calls or fall back to synthetic straight lines.
   - Therefore, a new endpoint `POST /api/matrix` must be introduced, taking lists of `origins` and `destinations`, computing both a duration 2D array and a distance 2D array via one-to-many Dijkstra/search runs.

2. **Asymmetric Network Costs**:
   - In directed road networks with one-way streets (`oneway=yes`, e.g. motorways in `src/osm/parser.rs:87` and urban one-way streets), turning restrictions, and congestion profiles, cost from node $A \to B$ is mathematically distinct from $B \to A$.
   - For disconnected or restricted pairs, the matrix cell must be populated with `null` (never 0, never straight-line Euclidean distance).

3. **Fleet Vehicle Profiles & Road Class Filtering**:
   - R2 requires: *"Fleet vehicle profiles (e.g. truck, van, motorcycle) respecting physical turn, road class, and speed limits."*
   - Acceptance criteria require: *"Vehicle profile filters restrict access to valid road classes."*
   - Right now, `RoadGraph` discards highway tags on load (Section 1.2), preventing profile filtering.
   - To satisfy ROUTE-01:
     - An enum `RoadClass` (e.g. `Motorway`, `MotorwayLink`, `Trunk`, `Primary`, `Secondary`, `Tertiary`, `Residential`, `Service`, `LivingStreet`) must be stored on `Edge`.
     - An enum `VehicleProfile` (`Truck`, `Van`, `Motorcycle`, `Car`) must be implemented with:
       - Access restrictions: `Truck` banned from `LivingStreet` and narrow `Service`; `Motorcycle` banned from `Motorway` (e.g. Phnom Penh - Sihanoukville expressway); `Van` and `Car` follow standard rules.
       - Speed limits: Effective edge speed is $\min(road\_speed, profile\_max\_speed(road\_class))$.
       - Turn penalties: Scaled per profile (motorcycle: agile, minimal delay; van: standard; truck: wide turns with 10–18s delays and prohibited U-turns).

4. **Real-PBF Validation & Geometry Extraction Without Straight Lines**:
   - R2 requires: *"Real-PBF road graph validation and geometry extraction without fallback to unverified straight lines."*
   - In `src/main.rs`, missing `--data` paths trigger silent demo fallback (Section 1.4).
   - In `logistics-sandbox`, failed routes generate synthetic straight lines (Section 1.5).
   - Strict behavior requires:
     - If `--data <PATH>` is supplied, the file MUST exist, be non-empty, and contain valid OSM PBF data; if invalid or missing, the process MUST exit with a fatal error and non-zero code.
     - Demo graph should ONLY be loaded when explicitly requested (`--demo` or explicit configuration).
     - Geometry extraction in `/api/route` must strictly yield real road node coordinates.
     - Matrix queries returning unreachable cells must return `null`, allowing consumers to detect disconnected components rather than fabricating straight paths.

5. **Pinned Graph and Cost Model Versioning**:
   - R2 requires: *"Pinned graph and cost model versioning in responses."*
   - `BACKLOG.md` entry for ROUTE-01 requires: *"Known routes and unavailable cells; pinned graph/cost versions; measured scale"*.
   - Currently, responses omit any graph or cost model identifiers (Section 1.1).
   - Responses (`POST /api/matrix`, `POST /api/route`, `GET /api/graph/stats`, `GET /api/health`) must include:
     - `graph_version`: e.g. `"demo-cambodia-v1.0"` (or SHA-256 digest of real PBF).
     - `cost_model_version`: e.g. `"tdsp-profiles-v1.0"`.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Routing Matrix | Directed Cost Matrix (`POST /api/matrix`) | Computes $N \times M$ duration and distance matrices supporting asymmetric network costs and unreachable cells. | `origins: Vec<Coordinate>`, `destinations: Vec<Coordinate>`, `profile: Option<String>`, `metrics: Option<Vec<String>>`, `departure_time: Option<String>` | `durations: Vec<Vec<Option<f64>>>`, `distances: Vec<Vec<Option<f64>>>`, `origins_snapped`, `destinations_snapped`, `graph_version`, `cost_model_version`, `profile`, `query_time_ms` | `400 Bad Request` if origins/destinations empty, invalid coords, or snapping fails. | `ORIGINAL_REQUEST.md` R2, `BACKLOG.md` line 21 |
| 2 | Vehicle Profiles | Fleet Vehicle Profiles (`profile: "truck" \| "van" \| "motorcycle" \| "car"`) | Restricts traversal by road class, enforces vehicle-specific speed limits, and adjusts turn penalties. | `profile: String` in Route and Matrix requests | Path/matrix computed with vehicle-specific permissions and weights | `404 Not Found` if route blocked by profile restrictions (e.g. motorcycle on motorway). | `ORIGINAL_REQUEST.md` R2, `AGENTS.md` |
| 3 | Vehicle Profiles | Road Class Filtering on Graph Edges | Tags each graph edge with `RoadClass` (Motorway, Trunk, Primary, Secondary, Tertiary, Residential, LivingStreet, etc.) to allow profile gating. | `RoadClass` enum stored on `Edge` | Edges filtered during Dijkstra/A* relaxation if prohibited by active profile | Edge skipped during search expansion; unreachable path returns `null` in matrix or 404 in route. | `osm-pathfinder/src/graph/types.rs`, `osm/parser.rs` |
| 4 | Vehicle Profiles | Profile-Specific Speed Caps | Limits edge traversal speed by vehicle capability and legal road limits (e.g. truck max 80 km/h on motorway). | Vehicle profile and edge road class | Calculated `duration_s` reflects $\min(road\_speed, profile\_speed)$ | Fallback to safe road default if tag unknown | `osm-pathfinder/src/osm/parser.rs` |
| 5 | Vehicle Profiles | Physical Turn Angles and Vehicle Gating | Scales turn penalties by vehicle agility (motorcycle: 1–4s; van: 4–8s; truck: 10–18s; truck U-turns > 135° disallowed or 60s). | Ingress bearing, egress bearing, vehicle profile | Added duration penalty in seconds to edge traversal | Extreme turns marked impassable for heavy trucks | `osm-pathfinder/src/geo/bearing.rs` |
| 6 | Provenance | Pinned Graph Versioning | Attaches deterministic dataset identifier or SHA-256 hash of loaded graph to all responses. | Loaded graph state (`RoadGraph` / PBF file metadata) | `graph_version: String` in HTTP JSON responses | Unknown graph data returns explicit fallback hash | `ORIGINAL_REQUEST.md` R2, `BACKLOG.md` line 21 |
| 7 | Provenance | Pinned Cost Model Versioning | Attaches semantic version of cost equations, traffic parameters, and profile models to all responses. | Configured cost model in engine | `cost_model_version: String` in HTTP JSON responses | None (static string constant) | `ORIGINAL_REQUEST.md` R2, `BACKLOG.md` line 21 |
| 8 | Graph Loader | Strict PBF Validation & Fail-Fast | Validates PBF path and file integrity on boot; rejects non-existent or corrupted files without silent demo fallback. | CLI flag `--data <PATH>` | Validated in-memory `RoadGraph` or process exit with error code 1 | Process exits with error message; does NOT fallback to demo network unless `--demo` is passed. | `osm-pathfinder/src/main.rs`, `Validate.ps1` |
| 9 | Graph Loader | Explicit Demo Mode Declaration | Loads built-in 44-node Cambodia skeleton network only when `--demo` is explicitly declared. | CLI flag `--demo` | Demo `RoadGraph` loaded with `graph_version: "demo-cambodia-v1.0"` | Mutually exclusive with `--data` or explicit warning | `Validate.ps1` line 58, `SETUP_STATUS.md` |
| 10 | API Contract | No-Straight-Line Geometry Guarantee | Never returns synthetic Euclidean direct lines on routing failure; returns structured errors or `null` matrix cells. | Failed route query | HTTP 404 / 422 with structured `{ error, code }`, or `null` in matrix cells | Machine-readable error code (`NO_ROUTE_FOUND`, `SNAPPING_FAILED`) | `ORIGINAL_REQUEST.md` line 45, `AGENTS.md` |
| 11 | Single-Route | Profile-Aware Route Query (`POST /api/route`) | Extends `/api/route` with `profile` parameter, returning versioned response with road-class compliance. | `RouteRequest` with `profile: Option<String>` | `RouteResponse` with `profile`, `graph_version`, `cost_model_version` | HTTP 404 if profile cannot traverse road network between points | Discovered related feature to matrix profiles |
| 12 | Isochrones | Profile-Aware Reachability (`POST /api/isochrone`) | Extends isochrone contours with `profile` parameter (e.g. motorcycle reach differs from truck reach). | `IsochroneRequest` with `profile: Option<String>` | GeoJSON contours respecting vehicle road access and speed caps | HTTP 400 on snapping failure | Discovered related feature in `src/pathfinding/isochrone.rs` |
| 13 | Diagnostics | Extended Graph Stats (`GET /api/graph/stats`) | Provides dataset provenance, road class edge distribution, and versioning info. | GET request | `{ nodes, edges, graph_version, cost_model_version, dataset_type, road_classes }` | None | Discovered related feature in `src/api/handlers.rs` |
| 14 | Existing Route | Dynamic TDSP Traffic Congestion | Evaluates time-of-day traffic spikes around urban hubs for Dijkstra, A*, and Bidirectional search. | `departure_time: "HH:MM"` | Travel duration scaled by temporal and spatial multipliers | 400 Bad Request if combined with Contraction Hierarchies | `osm-pathfinder/src/traffic/mod.rs` |
| 15 | Existing Route | Contraction Hierarchies Query (`algorithm: "ch"`) | Sub-millisecond queries via precomputed shortcut upward search. | Start/end nodes, static metric (time or distance) | Optimal shortest path and unpacked geometry | Rejects dynamic `departure_time` with HTTP 400 | `osm-pathfinder/src/pathfinding/ch.rs` |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Matrix Computation | 1 origin, 1 destination at identical coordinates | Returns $1 \times 1$ matrix with `durations: [[0.0]]`, `distances: [[0.0]]`. |
| 2 | Matrix Computation | Unreachable destination (disconnected graph component) | Cell $(i, j)$ returns `null` for both `durations` and `distances`; does NOT fail the entire matrix or return 0 / $\infty$. |
| 3 | Matrix Computation | Directed one-way street $A \to B$ with no reverse road | Returns short distance/duration for $(A, B)$, and `null` (or long detour) for $(B, A)$, proving $M[i][j] \ne M[j][i]$. |
| 4 | Vehicle Profiles | Heavy `truck` query starting on a narrow `living_street` or pedestrian path | Snap finds nearest valid road class or fails with explicit error; router avoids `living_street` segments. |
| 5 | Vehicle Profiles | `motorcycle` routing between Phnom Penh and Sihanoukville | Prohibits `motorway` (PP-Sihanoukville Expressway); routes strictly via `trunk` (NR4); path is longer in duration than passenger car route. |
| 6 | Vehicle Profiles | `truck` routing between Phnom Penh and Sihanoukville | Allowed on Expressway but speed capped at 80 km/h (vs 120 km/h for car); route duration reflects lower speed limit. |
| 7 | Vehicle Profiles | Heavy `truck` encountering sharp 180° hairpin / U-turn | High turn penalty (e.g. 60s) or turn marked impassable; router chooses wider roundabout or arterial intersection. |
| 8 | Real-PBF Validation | Missing PBF file (`--data data/missing.osm.pbf`) | Server terminates immediately on startup with exit code 1; does NOT silently fall back to demo graph. |
| 9 | Real-PBF Validation | Corrupted or empty PBF file (`0 bytes`) | Parser fails with explicit parse error; server terminates with exit code 1. |
| 10 | Real-PBF Validation | Out-of-bounds coordinates (e.g. North Pole `lat: 89.0, lon: 0.0`) against Cambodia graph | Snapping distance exceeds maximum threshold (e.g. 10 km); returns `400 Bad Request: "No road network node found near coordinate"`. |
| 11 | Provenance Versioning | PBF graph loaded from disk | Response contains `graph_version: "pbf-<hash>"` matching SHA-256 of the input PBF file. |
| 12 | Provenance Versioning | Built-in demo graph loaded via `--demo` | Response contains `graph_version: "demo-cambodia-v1.0"`. |
| 13 | Traffic & Matrix | Matrix query with morning rush hour `departure_time: "08:15"` | `durations` matrix entries in urban Phnom Penh are significantly higher than free-flow midnight (`"00:00"`), while `distances` remain constant. |
| 14 | Contraction Hierarchies & Matrix | Dynamic `departure_time` requested with CH algorithm in matrix | Returns `400 Bad Request` explaining static nature of CH shortcuts (or automatically selects Dijkstra/A* for dynamic matrix). |

---

## 5. Specification Contracts & Target Interfaces

### 5.1 HTTP API Contract: `POST /api/matrix`

#### Request Schema
```json
{
  "origins": [
    { "lat": 11.5564, "lon": 104.9282 },
    { "lat": 11.5680, "lon": 104.9223 }
  ],
  "destinations": [
    { "lat": 11.5435, "lon": 104.9142 },
    { "lat": 13.3671, "lon": 103.8448 }
  ],
  "profile": "van",
  "metrics": ["duration", "distance"],
  "algorithm": "dijkstra",
  "departure_time": "08:30"
}
```

#### Response Schema (Success 200 OK)
```json
{
  "durations": [
    [412.5, 17850.2],
    [320.1, 17620.8]
  ],
  "distances": [
    [3840.0, 264500.0],
    [3100.0, 262100.0]
  ],
  "origins_snapped": [
    [104.9282, 11.5564],
    [104.9223, 11.5680]
  ],
  "destinations_snapped": [
    [104.9142, 11.5435],
    [103.8448, 13.3671]
  ],
  "profile": "van",
  "graph_version": "demo-cambodia-v1.0",
  "cost_model_version": "tdsp-profiles-v1.0",
  "query_time_ms": 1.45
}
```

#### Unreachable Cell Representation
If origin $i$ cannot reach destination $j$ (e.g. disconnected or blocked by vehicle profile):
```json
{
  "durations": [
    [412.5, null]
  ],
  "distances": [
    [3840.0, null]
  ]
}
```
**Strict Invariant**: Under no circumstances does the engine substitute straight-line distances or synthetic non-null numbers for unreachable cells.

---

### 5.2 Vehicle Profile Specifications

| Profile Key | Target Fleet | Prohibited Road Classes | Max Speed Caps (km/h) | Turn Penalties (Right / Left / U-turn) |
|---|---|---|---|---|
| `car` | Passenger vehicle / taxi | None (standard motorable roads) | Motorway: 120, Trunk: 100, Primary: 80, Secondary: 60, Tertiary: 50, Residential: 30, LivingStreet: 15 | Right: 4.0s, Left: 8.0s, U-turn: 15.0s |
| `van` | Light delivery van / courier | LivingStreet (if narrow/restricted) | Motorway: 100, Trunk: 80, Primary: 70, Secondary: 50, Tertiary: 40, Residential: 30, Service: 20 | Right: 5.0s, Left: 10.0s, U-turn: 20.0s |
| `truck` | Heavy commercial / freight | LivingStreet, Residential (non-arterial), narrow Service | Motorway: 80, Trunk: 70, Primary: 60, Secondary: 40, Tertiary: 30, Unclassified: 30 | Right: 10.0s, Left: 18.0s, Hairpin > 120°: 30.0s, U-turn > 135°: Disallowed / 60.0s |
| `motorcycle`| Courier motorbike / 2-wheeler | Motorway / Expressway (PP-Sihanoukville) | Trunk: 70, Primary: 60, Secondary: 50, Tertiary: 40, Residential: 30, LivingStreet: 20 | Right: 2.0s, Left: 4.0s, U-turn: 6.0s |

---

### 5.3 Rust Type Contracts to Introduce

```rust
// In src/graph/types.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoadClass {
    Motorway,
    MotorwayLink,
    Trunk,
    TrunkLink,
    Primary,
    PrimaryLink,
    Secondary,
    SecondaryLink,
    Tertiary,
    TertiaryLink,
    Unclassified,
    Residential,
    Service,
    LivingStreet,
    Other,
}

#[derive(Debug, Clone, Copy)]
pub struct Edge {
    pub target: u32,
    pub distance_m: f64,
    pub duration_s: f64,
    pub road_class: RoadClass,
}

// In src/pathfinding/profile.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum VehicleProfile {
    #[default]
    Car,
    Van,
    Truck,
    Motorcycle,
}

impl VehicleProfile {
    pub fn is_road_allowed(&self, road_class: RoadClass) -> bool;
    pub fn max_speed_kmh(&self, road_class: RoadClass) -> f64;
    pub fn turn_penalty(&self, turn_angle_deg: f64) -> f64;
}

// In src/api/handlers.rs
#[derive(Debug, Deserialize)]
pub struct MatrixRequest {
    pub origins: Vec<CoordinateRequest>,
    pub destinations: Vec<CoordinateRequest>,
    #[serde(default)]
    pub profile: VehicleProfile,
    #[serde(default)]
    pub departure_time: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MatrixResponse {
    pub durations: Vec<Vec<Option<f64>>>,
    pub distances: Vec<Vec<Option<f64>>>,
    pub origins_snapped: Vec<[f64; 2]>,
    pub destinations_snapped: Vec<[f64; 2]>,
    pub profile: VehicleProfile,
    pub graph_version: String,
    pub cost_model_version: String,
    pub query_time_ms: f64,
}
```

---

## 6. Caveats

1. **PBF Test Extracts**: There is no live `cambodia-latest.osm.pbf` committed in `osm-pathfinder/data/` (it is gitignored to avoid repository bloat). Real PBF tests require downloading the extract via `scripts/download_cambodia_osm.ps1` or constructing a small synthetic binary PBF fixture for unit testing.
2. **Contraction Hierarchies with Multi-Profile**: CH shortcuts are preprocessed based on fixed edge weights. If multiple vehicle profiles or dynamic departure times are used, standard static CH shortcuts cannot be shared without multi-metric CH or CH per profile. For ROUTE-01 matrix calculations with dynamic profiles and TDSP traffic, one-to-many Dijkstra / A* is the natural, optimal query engine.
3. **No Implementation Executed**: In accordance with the SPECIFICATION MINER role, no production files or code in `osm-pathfinder` were modified during this turn.

---

## 7. Conclusion

`osm-pathfinder` has a robust, clean foundation (Axum 0.7, flat adjacency lists, R-Tree spatial indexing, Dijkstra, A*, Bidirectional search, CH shortcuts, and TDSP traffic modeling) and an active test suite passing with 40 tests under the GNU toolchain.

However, to satisfy **R2. ROUTE-01**:
1. **A Directed Cost Matrix Endpoint (`POST /api/matrix`)** must be implemented to replace inefficient loop queries and eliminate synthetic straight-line fallbacks in downstream services.
2. **Vehicle Profiles (`car`, `van`, `truck`, `motorcycle`)** must be introduced, backed by `RoadClass` retention on `Edge`, with explicit road class access gating (e.g. banning motorcycles on expressways and trucks on living streets), profile-specific speed caps, and turn penalties.
3. **Strict PBF Validation** must replace the current silent fallback in `main.rs`, halting the process if an explicit `--data` file does not exist or is invalid.
4. **Pinned Versioning** (`graph_version` and `cost_model_version`) must be included in all route, matrix, stats, and health responses to provide immutable planning provenance for simulation and VRP solvers.

---

## 8. Verification Method

To independently reproduce and verify these findings:

1. **Verify Rust Test Suite & Formatting**:
   ```powershell
   cd c:\Users\User\study-workspace\supply-chain-workspace\osm-pathfinder
   cargo +stable-x86_64-pc-windows-gnu test
   # Expected: 40 tests passed (38 library unit tests, 2 integration tests).
   cargo +stable-x86_64-pc-windows-gnu clippy -- -D warnings
   # Expected: 0 warnings.
   cargo +stable-x86_64-pc-windows-gnu fmt --check
   # Expected: Reports existing formatting diffs in src/graph/demo.rs (lines 33, 41, 299, 306, 317).
   ```

2. **Verify Missing Matrix Route**:
   Inspect `osm-pathfinder/src/api/routes.rs` lines 24–36. Confirm absence of `/api/matrix`.

3. **Verify Edge Struct Missing Road Class**:
   Inspect `osm-pathfinder/src/graph/types.rs` lines 20–28. Confirm `Edge` contains only `target`, `distance_m`, and `duration_s`.

4. **Verify Silent Fallback in Main**:
   Inspect `osm-pathfinder/src/main.rs` lines 55–69. Confirm `let use_demo = args.demo || args.data.as_ref().map(|p| !p.exists()).unwrap_or(true);`.

5. **Verify Synthetic Fallback in Sandbox**:
   Inspect `logistics-sandbox/backend/src/routing/client.ts` lines 99–103. Confirm `fallbackDistance = haversineDistanceSimple(start, end)`.
