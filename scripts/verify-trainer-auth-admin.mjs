import {
  assertTrainerDeletableByClientCount,
  parseTrainerIdForAdmin,
  trainerCreateErrorRu,
  validateTrainerNameForAdmin,
  validateTrainerPasswordConfirm,
  validateTrainerPasswordForAdmin,
} from '../src/lib/admin/trainerAuthAdminCore.js'
import { PASSWORD_MIN_LEN, newPasswordError } from '../src/lib/passwordPolicyCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(PASSWORD_MIN_LEN === 8, 'policy: min 8')
ok(newPasswordError('1234567') === 'Пароль не короче 8 символов', 'policy: short → ru error')
ok(newPasswordError('12345678') === null, 'policy: 8 chars ok')
ok(newPasswordError(null) !== null, 'policy: empty rejected')
ok(validateTrainerPasswordForAdmin('1234567').ok === false, 'short password rejected')
ok(validateTrainerPasswordForAdmin('12345678').ok === true, 'min password ok')
ok(validateTrainerPasswordForAdmin('  12345678  ').password === '12345678', 'password edges trimmed')
ok(validateTrainerPasswordConfirm('secret12', 'secret21').ok === false, 'mismatch rejected')
ok(validateTrainerPasswordConfirm('secret12', 'secret12').ok === true, 'match ok')
ok(validateTrainerPasswordConfirm('  secret12  ', 'secret12').ok === true, 'confirm after trim')

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

const dupRu = 'Такой логин или почта уже заняты — выберите другой'
ok(trainerCreateErrorRu('duplicate key value violates unique constraint "users_login_key"') === dupRu, 'pg dup login → ru')
ok(trainerCreateErrorRu('A user with this email address has already been registered') === dupRu, 'supabase dup email → ru')
ok(trainerCreateErrorRu('connection refused') === 'connection refused', 'other error kept')
ok(trainerCreateErrorRu(null) === 'Не удалось создать тренера', 'empty error → default')

console.log('verify-trainer-auth-admin: all passed')
