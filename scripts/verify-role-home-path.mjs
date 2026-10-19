/**
 * Домашний путь роли после входа сотрудника.
 * node scripts/verify-role-home-path.mjs
 */
import { roleHomePath } from '../src/lib/roleHomePathCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(roleHomePath('admin') === '/admin', 'admin → /admin')
ok(roleHomePath('sales_manager') === '/sales', 'sales_manager → /sales')
ok(roleHomePath('supervisor') === '/club', 'supervisor → /club')
ok(roleHomePath('trainer') === '/trainer', 'trainer → /trainer')
ok(roleHomePath(null) === '/trainer', 'unknown → /trainer')
ok(roleHomePath('') === '/trainer', 'empty → /trainer')

console.log('verify-role-home-path: all ok')
