/**
 * node scripts/verify-iskra-tts.mjs
 */
import {
  resolveIskraNeuralVoice,
  truncateIskraTtsText,
  ISKRA_TTS_MAX_CHARS,
} from '../api/_lib/iskraTtsEdgeCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(resolveIskraNeuralVoice('female') === 'ru-RU-SvetlanaNeural', 'female svetlana')
ok(resolveIskraNeuralVoice('male') === 'ru-RU-DmitryNeural', 'male dmitry')
ok(truncateIskraTtsText('') === '', 'empty truncate')
ok(truncateIskraTtsText('  Привет  ').includes('Привет'), 'trim truncate')
ok(truncateIskraTtsText('а'.repeat(ISKRA_TTS_MAX_CHARS + 50)).length <= ISKRA_TTS_MAX_CHARS, 'max chars')

if (failed) process.exit(1)
console.log('verify-iskra-tts: all passed')
