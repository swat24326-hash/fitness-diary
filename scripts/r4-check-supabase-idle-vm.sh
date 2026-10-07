#!/usr/bin/env bash
# R4: после cutover (01.10) в старый Supabase никто не пишет — последние даты записей по таблицам.
# Запуск на ВМ: sudo bash scripts/r4-check-supabase-idle-vm.sh  (ключи из .env, в вывод не попадают)
set -euo pipefail
cd /opt/fitness-diary
env_val() { grep -E "^$1=" .env | head -n1 | cut -d= -f2- | tr -d '\r"'"'"; }
U=$(env_val SUPABASE_URL)
K=$(env_val SUPABASE_SERVICE_ROLE_KEY)
if [ -z "$U" ] || [ -z "$K" ]; then echo "нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в .env"; exit 1; fi

TABLES="trainings clients memberships users challenges sale_clips club_call_log club_sms_log pnk_funnel_events client_weight_entries body_measurements health_cards trainer_schedule_entries loyalty_ledger"
for t in $TABLES; do
  out="$t: нет дат"
  for c in updated_at created_at; do
    r=$(curl -s -m 20 "$U/rest/v1/$t?select=$c&order=$c.desc.nullslast&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K" || true)
    if printf '%s' "$r" | grep -q "\"$c\""; then out="$t.$c: $r"; break; fi
  done
  echo "$out"
done
