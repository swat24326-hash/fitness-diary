import {
  assertCanCreateSupervisor,
  canAccessDeletionAuditLog,
  canSupervisorAccessClub,
  isSupervisorDeniedPushTable,
  isSupervisorRole,
  normalizeSupervisorRole,
  supervisorHomePath,
} from '../src/lib/admin/supervisorAccessCore.js'
import { resolveListTrainersRoleParam } from '../src/lib/admin/listStaffRoleFilterCore.js'
import { USERS_SUPERVISOR_ROLES } from '../src/lib/userRoleConstants.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(USERS_SUPERVISOR_ROLES.includes('supervisor'), 'constants en')
ok(USERS_SUPERVISOR_ROLES.includes('управляющий'), 'constants ru')
ok(isSupervisorRole('supervisor'), 'is supervisor')
ok(isSupervisorRole('управляющий'), 'cyrillic supervisor')
ok(!isSupervisorRole('sales_manager'), 'not sales manager')
ok(!isSupervisorRole('admin'), 'not admin')
ok(normalizeSupervisorRole('Управляющий') === 'supervisor', 'normalize')

ok(canSupervisorAccessClub('club-a', 'club-a'), 'same club')
ok(!canSupervisorAccessClub('club-a', 'club-b'), 'other club blocked')
ok(canSupervisorAccessClub('club-a', ''), 'empty request = own club ok')
ok(!canSupervisorAccessClub('', 'club-a'), 'no profile club')

ok(assertCanCreateSupervisor(0).ok, 'first supervisor ok')
ok(!assertCanCreateSupervisor(1).ok, 'second blocked')
ok(String(assertCanCreateSupervisor(1).error || '').includes('уже есть'), 'error text')

ok(isSupervisorDeniedPushTable('membership_types'), 'deny types')
ok(isSupervisorDeniedPushTable('exercises'), 'deny exercises')
ok(!isSupervisorDeniedPushTable('clients'), 'allow clients')
ok(!isSupervisorDeniedPushTable('trainings'), 'allow trainings')

ok(canAccessDeletionAuditLog({ isAdmin: true }), 'admin deletion log')
ok(canAccessDeletionAuditLog({ isSalesManager: true }), 'sales manager deletion log (current product)')
ok(!canAccessDeletionAuditLog({ isSupervisor: true }), 'supervisor no deletion log')
ok(!canAccessDeletionAuditLog({ isSupervisor: true, isAdmin: true }), 'supervisor wins over admin bit')
ok(!canAccessDeletionAuditLog({}), 'anon no')

ok(supervisorHomePath() === '/club', 'home')
ok(supervisorHomePath('settings') === '/club/settings', 'settings')

ok(resolveListTrainersRoleParam('supervisor') === 'supervisor', 'list-trainers role=supervisor')
ok(resolveListTrainersRoleParam('sales_manager') === 'sales_manager', 'list-trainers role=sales_manager')
ok(resolveListTrainersRoleParam('trainer') === null, 'list-trainers default trainers (no param)')
ok(resolveListTrainersRoleParam(undefined) === null, 'list-trainers empty → trainers')

process.exit(failed > 0 ? 1 : 0)
