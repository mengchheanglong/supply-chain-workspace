# syntax=docker/dockerfile:1
FROM rust:1.94-bookworm AS build
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY benches ./benches
RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system routing \
    && useradd --system --gid routing routing
WORKDIR /app
COPY --from=build /build/target/release/osm-pathfinder /app/osm-pathfinder
COPY frontend ./frontend
USER routing
EXPOSE 8000
ENTRYPOINT ["/app/osm-pathfinder"]
