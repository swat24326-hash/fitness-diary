/**
 * Подстановка пульса подхода из живого слота.
 * node scripts/verify-hr-after-from-live.mjs
 */
import {
  HR_AFTER_DOUBLE_TAP_MS,
  applyHrAfterFillFromLive,
  hrAfterFillUserMessage,
  hrAfterFromLiveSlot,
} from '../src/lib/hr/hrAfterFromLiveSlot.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

{
  const calls = { change: [], blur: 0 }
  const r = applyHrAfterFillFromLive({ bpm: 155, status: 'live' }, {
    onChange: (v) => calls.change.push(v),
    blur: () => {
      calls.blur += 1
    },
  })
  ok(r.filled === true && r.value === '155' && r.blurred === true, 'успех → filled+blurred')
  ok(calls.change.join(',') === '155' && calls.blur === 1, 'успех вызывает onChange и blur')
}

{
  const calls = { change: [], blur: 0 }
  const r = applyHrAfterFillFromLive({ status: 'lost' }, {
    onChange: (v) => calls.change.push(v),
    blur: () => {
      calls.blur += 1
    },
  })
  ok(r.filled === false && r.reason === 'lost' && r.blurred === false, 'нет сигнала → не fill')
  ok(calls.change.length === 0 && calls.blur === 0, 'нет сигнала — без onChange/blur')
}

{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const sw = readFileSync(join(root, 'src/components/HeaderStopwatch.jsx'), 'utf8')
  ok(!sw.includes('requestAnimationFrame'), 'секундомер без rAF setState')
  ok(sw.includes('setInterval(paint'), 'секундомер: DOM paint через setInterval')
  ok(sw.includes('STOPWATCH_PAINT_MS'), 'секундомер: интервал из core')
  const field = readFileSync(join(root, 'src/components/trainer/TrainingSetHrField.jsx'), 'utf8')
  ok(field.includes('applyHrAfterFillFromLive'), 'ячейка Пульс — applyHrAfterFillFromLive')
}

console.log('verify-hr-after-from-live: all ok')
