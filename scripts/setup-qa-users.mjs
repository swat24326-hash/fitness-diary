/**
 * Создать/обновить QA-пользователей для ручной и автопроверки.
 * node scripts/setup-qa-users.mjs
 */
import { QA_CLUB_ID, QA_PASSWORD, QA_PREFIX, createSupabaseAdmin, upsertQaUser } from './lib/qaSupabaseAdmin.mjs'

const admin = createSupabaseAdmin()
for (const spec of [
  { login: `${QA_PREFIX}admin`, role: 'admin', name: 'QA Admin', club_id: null },
  { login: `${QA_PREFIX}trainer`, role: 'trainer', name: 'QA Trainer', club_id: QA_CLUB_ID },
  { login: `${QA_PREFIX}sales`, role: 'sales_manager', name: 'QA Sales', club_id: QA_CLUB_ID },
]) {
  const row = await upsertQaUser(admin, spec)
  console.log(`${row.action}: ${row.login} / ${QA_PASSWORD} (${row.role})`)
}
console.log('\nQA users ready.')
