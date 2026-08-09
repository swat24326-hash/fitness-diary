/**
 * Проверка переименования / уникальности code типов абонементов.
 */
import {
  findMembershipTypeByCode,
  normalizeMembershipTypeCode,
  validateMembershipTypeCodeChange,
} from '../src/lib/membershipTypesCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeMembershipTypeCode('  Dm  ') === 'Dm', 'trim code')
ok(normalizeMembershipTypeCode('x'.repeat(20)).length === 12, 'max 12')

const types = [
  { id: '1', code: 'Dm', is_active: true },
  { id: '2', code: 'Vip 1', is_active: true },
  { id: '3', code: 'Old', is_active: false },
]

ok(findMembershipTypeByCode(types, 'dm')?.id === '1', 'find ignores case')
ok(findMembershipTypeByCode(types, 'Dm', { excludeId: '1' }) == null, 'exclude self')
ok(findMembershipTypeByCode(types, 'Old')?.is_active === false, 'finds inactive')

const empty = validateMembershipTypeCodeChange({ nextCode: '  ', existingTypes: types })
ok(!empty.ok && /назван/i.test(empty.error), 'rejects empty')

const unchanged = validateMembershipTypeCodeChange({
  nextCode: 'Dm',
  previousCode: 'Dm',
  existingTypes: types,
  excludeId: '1',
})
ok(unchanged.ok && unchanged.unchanged === true, 'same code is unchanged')

const caseOnly = validateMembershipTypeCodeChange({
  nextCode: 'DM',
  previousCode: 'Dm',
  existingTypes: types,
  excludeId: '1',
})
ok(caseOnly.ok && caseOnly.code === 'DM' && !caseOnly.unchanged, 'case-only rename ok')

const dup = validateMembershipTypeCodeChange({
  nextCode: 'vip 1',
  previousCode: 'Dm',
  existingTypes: types,
  excludeId: '1',
})
ok(!dup.ok && /уже в списке/i.test(dup.error), 'rejects active duplicate')

const dupOff = validateMembershipTypeCodeChange({
  nextCode: 'old',
  previousCode: 'Dm',
  existingTypes: types,
  excludeId: '1',
})
ok(!dupOff.ok && /отключ/i.test(dupOff.error), 'rejects inactive duplicate')

const okRename = validateMembershipTypeCodeChange({
  nextCode: ' El ',
  previousCode: 'Dm',
  existingTypes: types,
  excludeId: '1',
})
ok(okRename.ok && okRename.code === 'El', 'rename to free code')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll membership type code checks passed')
