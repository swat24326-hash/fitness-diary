/**
 * Удалить qa_auto_* на prod после e2e.
 * node scripts/qa-roles-cleanup.mjs
 */
import { createSupabaseAdmin, deleteQaUsers } from './lib/qaSupabaseAdmin.mjs'

const admin = createSupabaseAdmin()
const deleted = await deleteQaUsers(admin)
for (const d of deleted) console.log(`deleted: ${d.login}`)
console.log(`cleanup: ${deleted.length} user(s)`)
