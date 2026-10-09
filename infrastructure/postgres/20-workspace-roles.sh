#!/usr/bin/env bash
set -euo pipefail

# Sourced by the official entrypoint on the FIRST initialization of an empty volume.
# Values are passed as psql variables and quoted as SQL literals, never interpolated SQL.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
  --set operations_password="$(cat /run/secrets/operations_app_password)" \
  --set planning_password="$(cat /run/secrets/planning_app_password)" \
  --set snapshot_password="$(cat /run/secrets/snapshot_reader_password)" <<'SQL'
CREATE ROLE operations_app LOGIN PASSWORD :'operations_password';
CREATE ROLE planning_app LOGIN PASSWORD :'planning_password';
CREATE ROLE snapshot_reader LOGIN PASSWORD :'snapshot_password';

REVOKE CONNECT, TEMPORARY ON DATABASE supply_chain_ops FROM PUBLIC;
GRANT CONNECT ON DATABASE supply_chain_ops TO operations_app, snapshot_reader;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO operations_app;
GRANT USAGE ON SCHEMA public TO snapshot_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO snapshot_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE operations_app IN SCHEMA public
  GRANT SELECT ON TABLES TO snapshot_reader;

CREATE DATABASE distribution_planning OWNER planning_app;
REVOKE CONNECT, TEMPORARY ON DATABASE distribution_planning FROM PUBLIC;
GRANT CONNECT ON DATABASE distribution_planning TO planning_app;
\connect distribution_planning
CREATE EXTENSION IF NOT EXISTS postgis;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO planning_app;
SQL
