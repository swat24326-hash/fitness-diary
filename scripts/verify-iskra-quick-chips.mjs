import {
  comparePreviousFromQuickChips,
  defaultIskraQuickChips,
  resolveInstantHandlerId,
  resolveIskraQuickChips,
  validateIskraQuickChipsForSave,
} from '../src/lib/admin/iskraQuickChipsCore.js'
import { GEMINI_QUICK_CHIPS } from '../src/lib/admin/geminiInstantReplies.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const defaults = defaultIskraQuickChips()
ok(defaults.length === GEMINI_QUICK_CHIPS.length, 'defaults match quick chips count')
ok(defaults[0]?.handler_id === 'intro', 'intro handler id')

ok(resolveIskraQuickChips(null).length === defaults.length, 'null uses defaults')
ok(resolveIskraQuickChips([]).length === defaults.length, 'empty uses defaults')

const custom = [
  { id: 'c1', label: 'Мой план', message: 'Как дела с планом?', handler_id: 'plan', compare: false },
  { id: 'c2', label: 'Спросить', message: 'Расскажи про возвраты', compare: false },
]
const resolved = resolveIskraQuickChips(custom)
ok(resolved.length === 2, 'custom chips resolved')
ok(resolved[0].label === 'Мой план', 'custom label kept')

const validated = validateIskraQuickChipsForSave(custom)
ok(validated.ok, 'custom validates')
ok(validated.chips.length === 2, 'validated count')

const bad = validateIskraQuickChipsForSave([{ id: 'x', label: '', message: 'abc' }])
ok(!bad.ok, 'empty label rejected')

const tooMany = validateIskraQuickChipsForSave(
  Array.from({ length: 13 }, (_, i) => ({
    id: `c${i}`,
    label: `L${i}`,
    message: `Question ${i}?`,
  })),
)
ok(!tooMany.ok, 'max chips enforced')

ok(
  resolveInstantHandlerId({
    userMessage: 'Как выполнен план продаж за этот месяц?',
    comparePrevious: false,
    quickChips: custom,
    handlerId: 'plan',
  }) === 'plan',
  'explicit handler id',
)

ok(
  resolveInstantHandlerId({
    userMessage: 'Как дела с планом?',
    comparePrevious: false,
    quickChips: custom,
  }) === 'plan',
  'handler from custom message',
)

ok(
  resolveInstantHandlerId({
    userMessage: 'Расскажи про возвраты',
    comparePrevious: false,
    quickChips: custom,
  }) === null,
  'gemini-only chip no handler',
)

ok(
  comparePreviousFromQuickChips(
    [{ id: 'x', label: 'A', message: 'Compare please', compare: true }],
    'Compare please',
  ),
  'compare flag from quick chips',
)

if (failed) process.exit(1)
console.log('verify-iskra-quick-chips: all passed')
