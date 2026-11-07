#!/bin/sh
# Applies supabase/migrations (mounted at /migrations), then the seed, after the auth service has
# created auth.*. Records what it applied (like `supabase db push`), so running it again only
# applies new migrations; the seed only ever runs on a fresh database.
set -e

export PGHOST="${PGHOST:-db}" PGUSER=postgres PGPASSWORD="${POSTGRES_PASSWORD:?}" PGDATABASE=postgres
IMAGE_BASE_URL="${IMAGE_BASE_URL:-http://localhost:4000}"

psql -v ON_ERROR_STOP=1 -q -c "create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key);"

apply() {
  version=$(basename "$1")
  if [ -n "$(psql -tA -c "select 1 from supabase_migrations.schema_migrations where version = '$version'")" ]; then
    return
  fi
  echo "Applying $version"
  # One transaction per file, so a failure leaves nothing half-applied.
  psql -v ON_ERROR_STOP=1 -v image_base="$IMAGE_BASE_URL" -q -1 -f "$1" \
    -c "insert into supabase_migrations.schema_migrations (version) values ('$version')"
}

for migration in /migrations/*.sql; do apply "$migration"; done
apply /fixtures/seed.sql
echo "Database ready."
