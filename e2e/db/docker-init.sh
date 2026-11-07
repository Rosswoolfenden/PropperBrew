#!/bin/sh
# Runs from /docker-entrypoint-initdb.d on the database's first start: just the roles and schemas
# the auth service needs (bootstrap.sql). Migrations and the seed come later, from migrate.sh,
# once the auth service has created its tables.
set -e

psql -v ON_ERROR_STOP=1 -v auth_password="${AUTH_DB_PASSWORD:?}" -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /fixtures/bootstrap.sql
