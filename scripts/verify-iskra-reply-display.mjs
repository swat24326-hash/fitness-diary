/**
 * node scripts/verify-iskra-reply-display.mjs
 */
import {
  iskraReplyLooksLikeWallOfText,
  parseIskraReplyBlocks,
  splitIskraNumberedItems,
  stripIskraFluffOpener,
  stripIskraReplyMarkdown,
} from '../src/lib/admin/iskraReplyDisplayCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(stripIskraReplyMarkdown('**Факты:** план 41%') === 'Факты: план 41%', 'strip markdown')
ok(stripIskraFluffOpener('На связи. Данные приняты. План 41%.') === 'План 41%.', 'strip fluff opener')

const sample =
  'На связи. Данные приняты.\n\n**Факты:** план 41,4%. **Вывод:** отстаём.\n\n**Рекомендации:** 1. Шаг один. 2. Шаг два.'
const blocks = parseIskraReplyBlocks(sample)
ok(!blocks.lead.toLowerCase().includes('данные приняты'), 'lead without fluff')
ok(blocks.sections.length === 3, 'three sections')
ok(blocks.sections[2].items.length === 2, 'numbered recommendations')

ok(splitIskraNumberedItems('1. А. 2. Б.').length === 2, 'split numbered')
ok(iskraReplyLooksLikeWallOfText('x'.repeat(300)), 'wall detect')

if (failed) process.exit(1)
console.log('verify-iskra-reply-display: all ok')
