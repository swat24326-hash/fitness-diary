import { clientCardHeaderAllowsIdentityEdit } from '../src/lib/admin/clientCardIdentityEditAccessCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

ok(clientCardHeaderAllowsIdentityEdit({ isTrainer: true, canManageClubClients: false }) === true, 'trainer sees header pencil')
ok(clientCardHeaderAllowsIdentityEdit({ isTrainer: true, canManageClubClients: true }) === false, 'club manager who is also trainer — desk only')
ok(clientCardHeaderAllowsIdentityEdit({ isTrainer: false, canManageClubClients: true }) === false, 'admin/manager no header pencil')
ok(clientCardHeaderAllowsIdentityEdit({ isTrainer: false, canManageClubClients: false }) === false, 'no role')
ok(clientCardHeaderAllowsIdentityEdit({}) === false, 'empty')

console.log('verify-client-card-identity-edit-access: ok')
