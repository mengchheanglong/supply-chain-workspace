# Telemetry source contract v1

P0-03 selects the fixture-labelled acceptance path. No Cassandra driver, connection,
observed device ingestion, throughput measurement or durable GPS acknowledgement exists.
`tenantId: demo` identifies synthetic scope; it does not implement tenant authorization.

## Marketplace read

`GET /api/riders?city=...` returns `schemaVersion: 1`, `success: true`,
`source/status: fixture`, `sourceId: marketplace-demo-riders-v1`, `tenantId: demo`,
`observedAt: null`, `storage: none`, `durable: false`, `sinkOwner: none`, and `riders`.
Units are degrees for coordinates, km/h for speed, percent for battery.
Fixture speed and battery values are illustrative, not device observations.
Counts describe returned fixtures; connected couriers is zero, sandboxSynced is false,
and throughput, daily volume and TTL are null (not measured or configured).
The endpoint does not poll the sandbox or merge simulated actors into fixtures.

The web reader accepts only this labelled v1 contract. Network/HTTP/invalid-response
failure yields `success: false`, `source/status: unavailable` and an empty roster.
It makes no secondary request and substitutes no browser fixture store. The UI labels
customer tracking as demo illustrations and clears fleet rows on unavailability.

`POST /api/riders/ping` always returns HTTP 503 with `success/stored/durable: false`,
`source: fixture`, `sinkOwner: none` and an explanation. It makes no storage mutation.
The compatibility browser writer returns failure without a network request.
Manual write controls and fabricated CQL feeds are removed.

## Sandbox history and acknowledgement

The simulation engine is the sole ping producer. It writes only its local in-memory
repository; the marketplace is not a second sink. A failed local write emits
`telemetry.storage.failed`, with `stored/durable: false`, rather than being swallowed.

`GET /api/telemetry/rider/:riderId` and `GET /api/telemetry/playback` return v1 metadata:
`source: simulated`, `sourceId/simulationId: current run UUID`, `tenantId: demo`,
`status: available`, `storage: in-memory`, `durable: false`, `sinkOwner: logistics-sandbox`.
Units are degrees, km/h, percent and simulation-ms. Ping rows include simulation_id.
Only the current run is returned even if older runs remain in the process buffer.
Zero rows means an empty retained history, not a disconnected datastore.
Limits are integers 1–1000; time windows require both finite endpoints in order.
Playback exports preserve simulated source and run identity. Failed refresh clears the trail.

Internal `savePing` resolves only after insertion or a matching retained retry. Its v1
acknowledgement includes `stored: true`, `replayed`, source/run/tenant/units and
`durable: false`. Identity is `(simulation_id, rider_id, ping_timestamp)`.
Concurrent identical retries retain one row; different payloads for that identity reject.
Reads and writes copy scalar records so callers cannot mutate stored history.
Validation rejects invalid coordinates, timestamps, speed and battery without a success ack.

The default capacity is 25,000 pings across all riders/runs. Oldest insertion is evicted
together with its identity index. Retry protection lasts only while a row is retained;
an evicted identity may be stored again. Everything disappears on process exit.
`saveBatch` is sequential, not transactional: earlier valid rows can remain if a later
row rejects. No Cassandra TTL or restart persistence is implied.

Deterministic clocks, pause/reset/replay and deployment egress controls are separate gates.
Future observed GPS ingestion needs a reviewed durable sink and a new explicit contract.
