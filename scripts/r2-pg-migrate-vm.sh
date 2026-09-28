#!/usr/bin/env bash
# Волна 2 R2: накатить схему на Managed PG с VM (кластер без публичного доступа).
# Usage: sudo bash r2-pg-migrate-vm.sh [--dry-run] [--with-policies]
set -euo pipefail
exec bash "$(dirname "$0")/r2-vm-db-run.sh" scripts/pg-migrate-all.mjs "$@"
