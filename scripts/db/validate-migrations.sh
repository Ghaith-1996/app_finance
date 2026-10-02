#!/usr/bin/env bash
# Rebuild the schema from scratch in a disposable Supabase Postgres container,
# then run the SQL regression tests in supabase/tests/*.test.sql.
#
# Never point this at a real Supabase project: it creates and destroys its own container.
#
#   bash scripts/db/validate-migrations.sh            # fresh container, migrations + tests
#   KEEP_DB=1 bash scripts/db/validate-migrations.sh  # leave the container running afterwards
set -euo pipefail

IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.064}"
CONTAINER="${PG_CONTAINER:-pf-migration-check}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql_exec() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q     -v DBLINK_HOST="${DBLINK_HOST:-localhost}" "$@"
}

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

# The Supabase image restarts once while running its init scripts; wait for auth.uid().
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" psql -U postgres -d postgres -Atc "select to_regprocedure('auth.uid()') is not null" 2>/dev/null | grep -q t; then
    break
  fi
  sleep 2
done
sleep 3
# Concurrency tests open extra sessions with dblink; loopback is "trust" in this image and dblink
# refuses password-less connections for non-superusers, so they connect via the container address.
DBLINK_HOST="$(docker exec "$CONTAINER" hostname -i | awk '{print $1}')"

failed=0
echo "== migrations"
for file in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  # Upgrade seeds: supabase/tests/upgrade/before_<prefix>_*.sql insert legacy-shaped rows right
  # before migration <prefix> runs, so its backfill is exercised like an upgrade of a live database.
  prefix="$(basename "$file" | cut -d_ -f1)"
  for seed in $(ls "$ROOT"/supabase/tests/upgrade/before_"$prefix"_*.sql 2>/dev/null | sort); do
    if output=$(psql_exec < "$seed" 2>&1); then
      echo "seed $(basename "$seed")"
    else
      echo "FAIL $(basename "$seed")"
      echo "$output" | tail -5
      failed=1
      break 2
    fi
  done
  if output=$(psql_exec < "$file" 2>&1); then
    echo "ok   $(basename "$file")"
  else
    echo "FAIL $(basename "$file")"
    echo "$output" | tail -5
    failed=1
    break
  fi
done

if [ "$failed" -eq 0 ]; then
  echo "== sql tests"
  for file in $(ls "$ROOT"/supabase/tests/*.test.sql 2>/dev/null | sort); do
    if output=$(psql_exec < "$file" 2>&1); then
      echo "ok   $(basename "$file")"
    else
      echo "FAIL $(basename "$file")"
      echo "$output" | tail -15
      failed=1
    fi
  done
fi

if [ -z "${KEEP_DB:-}" ]; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
fi

exit "$failed"
