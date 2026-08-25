import {
  assertTrainerDeletableByClientCount,
  parseTrainerIdForAdmin,
  validateTrainerNameForAdmin,
  validateTrainerPasswordConfirm,
  validateTrainerPasswordForAdmin,
} from '../src/lib/admin/trainerAuthAdminCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(validateTrainerPasswordForAdmin('12345').ok === false, 'short password rejected')
ok(validateTrainerPasswordForAdmin('123456').ok === true, 'min password ok')
ok(validateTrainerPasswordForAdmin('  123456  ').password === '123456', 'password edges trimmed')
ok(validateTrainerPasswordConfirm('secret1', 'secret2').ok === false, 'mismatch rejected')
ok(validateTrainerPasswordConfirm('secret1', 'secret1').ok === true, 'match ok')
ok(validateTrainerPasswordConfirm('  secret1  ', 'secret1').ok === true, 'confirm after trim')

const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
const parsed = parseTrainerIdForAdmin(uuid)
ok(parsed.ok && parsed.id === uuid, 'uuid parsed')
ok(parseTrainerIdForAdmin('bad').ok === false, 'bad id rejected')

ok(assertTrainerDeletableByClientCount(0).ok === true, 'zero clients deletable')
ok(assertTrainerDeletableByClientCount(3).ok === false, 'clients block delete')
ok(
  String(assertTrainerDeletableByClientCount(2).error).includes('2'),
  'delete error mentions count',
)

ok(validateTrainerNameForAdmin('').ok === false, 'empty name rejected')
ok(validateTrainerNameForAdmin('   ').ok === false, 'blank name rejected')
const nameOk = validateTrainerNameForAdmin('иванов иван')
ok(nameOk.ok && nameOk.name === 'Иванов Иван', 'name normalized')
ok(validateTrainerNameForAdmin('а'.repeat(200)).ok === false, 'too long name rejected')

console.log('verify-trainer-auth-admin: all passed')
