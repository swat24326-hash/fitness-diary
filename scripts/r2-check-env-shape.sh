#!/bin/bash
# Только форма ключей на Hybrid-стенде. Сами секреты не печатает.
set -euo pipefail
ENV_FILE="${1:-/opt/fitness-diary/.env}"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
k="${SUPABASE_SERVICE_ROLE_KEY:-}"
a="${SUPABASE_ANON_KEY:-}"
va="${VITE_SUPABASE_ANON_KEY:-}"
echo "service_set=$([ -n "$k" ] && echo yes || echo no)"
echo "service_len=${#k}"
echo "service_head=$(printf %s "$k" | cut -c1-3)"
echo "anon_len=${#a}"
echo "anon_head=$(printf %s "$a" | cut -c1-3)"
echo "service_eq_anon=$([ -n "$k" ] && [ "$k" = "$a" ] && echo yes || echo no)"
echo "service_eq_vite_anon=$([ -n "$k" ] && [ "$k" = "$va" ] && echo yes || echo no)"
echo "url_set=$([ -n "${SUPABASE_URL:-}" ] && echo yes || echo no)"
echo "vite_url_set=$([ -n "${VITE_SUPABASE_URL:-}" ] && echo yes || echo no)"
