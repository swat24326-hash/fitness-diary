/**
 * CORS `/api/*`: на проде только свой домен из PUBLIC_ORIGIN; без него (dev / стенд) — `*`.
 */
import { resolveCorsOrigin } from '../api/_lib/corsOriginCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

ok(resolveCorsOrigin({ PUBLIC_ORIGIN: 'https://app-core.ru' }) === 'https://app-core.ru', 'прод — свой домен')
ok(resolveCorsOrigin({ PUBLIC_ORIGIN: ' https://app-core.ru/ ' }) === 'https://app-core.ru', 'пробелы и слэш в конце срезаются')
ok(resolveCorsOrigin({ PUBLIC_ORIGIN: 'http://127.0.0.1:8080' }) === 'http://127.0.0.1:8080', 'стенд с портом')
ok(resolveCorsOrigin({}) === '*', 'нет PUBLIC_ORIGIN — *')
ok(resolveCorsOrigin({ PUBLIC_ORIGIN: '' }) === '*', 'пустой — *')
ok(resolveCorsOrigin({ PUBLIC_ORIGIN: 'app-core.ru' }) === '*', 'без схемы — не отдаём кривой заголовок')
ok(resolveCorsOrigin({ PUBLIC_ORIGIN: 'https://app-core.ru/admin' }) === '*', 'с путём — не origin')

if (failed) {
  console.error(`\nverify-cors-origin: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-cors-origin: ok')
