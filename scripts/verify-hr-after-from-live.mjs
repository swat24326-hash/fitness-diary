/**
 * Подстановка пульса подхода из живого слота.
 * node scripts/verify-hr-after-from-live.mjs
 */
import {
  HR_AFTER_DOUBLE_TAP_MS,
  hrAfterFillUserMessage,
  hrAfterFromLiveSlot,
} from '../src/lib/hr/hrAfterFromLiveSlot.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(HR_AFTER_DOUBLE_TAP_MS >= 250 && HR_AFTER_DOUBLE_TAP_MS <= 500, 'окно double-tap')

ok(hrAfterFromLiveSlot(null).ok === false && hrAfterFromLiveSlot(null).reason === 'no_slot', 'нет слота')
ok(hrAfterFromLiveSlot({}).reason === 'no_bpm', 'пустой слот')
ok(hrAfterFromLiveSlot({ status: 'connecting' }).reason === 'connecting', 'подключается')
ok(hrAfterFromLiveSlot({ status: 'lost' }).reason === 'lost', 'потерян')
ok(hrAfterFromLiveSlot({ bpm: 0, status: 'live' }).reason === 'no_bpm', 'bpm 0')
ok(hrAfterFromLiveSlot({ bpm: 999 }).reason === 'no_bpm', 'bpm вне диапазона')

{
  const r = hrAfterFromLiveSlot({ bpm: 142.6, status: 'live', stale: false })
  ok(r.ok === true && r.value === '143', `live → ${r.value}`)
}

{
  const r = hrAfterFromLiveSlot({ bpm: 128, status: 'live', stale: true })
  ok(r.ok === true && r.value === '128', 'stale с bpm — всё равно подставляем')
}

ok(hrAfterFillUserMessage('no_slot').includes('пульсометр'), 'текст no_slot')
ok(hrAfterFillUserMessage('lost').includes('сигнала'), 'текст lost')

console.log('verify-hr-after-from-live: all ok')
