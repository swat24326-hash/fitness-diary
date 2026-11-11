import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldReloadLoyaltyAccountOnLocalData } from '../src/lib/loyalty/loyaltyAccountReloadGateCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(shouldReloadLoyaltyAccountOnLocalData('sync-complete') === true, 'после Sync — перечитать')
ok(shouldReloadLoyaltyAccountOnLocalData('loyalty-glance') === false, 'loyalty-glance не перечитываем')
ok(shouldReloadLoyaltyAccountOnLocalData('sync-queue') === false, 'очередь sync — нет')
ok(shouldReloadLoyaltyAccountOnLocalData('') === false, 'пустой reason — нет')
ok(shouldReloadLoyaltyAccountOnLocalData(null) === false, 'null — нет')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hook = readFileSync(join(root, 'src/hooks/useClientLoyalty.js'), 'utf8')
ok(hook.includes('shouldReloadLoyaltyAccountOnLocalData'), 'хук использует gate')
ok(!/reason === ['"]loyalty-glance['"]/.test(hook), 'хук не слушает loyalty-glance напрямую')

console.log('verify-loyalty-account-reload-gate: all passed')
