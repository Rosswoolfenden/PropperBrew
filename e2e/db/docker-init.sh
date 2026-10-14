#!/bin/sh
# Runs from /docker-entrypoint-initdb.d on the database's first start. Expects the repo's
# supabase/migrations mounted at /migrations and this folder at /fixtures.
set -e

run() { psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$1"; }

run /fixtures/bootstrap.sql
for migration in /migrations/*.sql; do run "$migration"; done
run /fixtures/seed.sql
