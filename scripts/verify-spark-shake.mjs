/**
 * /me, график веса: «потрясите телефон» — распознавание тряски, волна по графику, подсказка.
 * node scripts/verify-spark-shake.mjs
 */
import {
  SHAKE_COOLDOWN_MS,
  SHAKE_HINT_MAX_VIEWS,
  SPARK_WAVE_POINT_MS,
  SPARK_WAVE_STAGGER_MS,
  createShakeDetector,
  shakeHintMode,
  sparkWaveAmps,
  sparkWaveDuration,
  sparkWaveLift,
} from '../src/lib/client/sparkShakeCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

/** Прогон замеров датчика: [x, y, z, мс]. Возвращает силы срабатываний. */
function run(feed, samples) {
  return samples.map(([x, y, z, t]) => feed(x, y, z, t)).filter((s) => s != null)
}
const still = (from, to, step = 100) => Array.from({ length: Math.floor((to - from) / step) }, (_, i) => [0, 0, 9.8, from + i * step])
const shake = (t0, amp = 12) => [
  [amp, 0, 9.8, t0],
  [-amp, 0, 9.8, t0 + 100],
  [amp, 0, 9.8, t0 + 200],
  [-amp, 0, 9.8, t0 + 300],
]
const bump = (t0) => [[20, 0, 9.8, t0], [0, 0, 9.8, t0 + 100]]

// --- Детектор ---
ok(run(createShakeDetector(), still(0, 3000)).length === 0, 'телефон лежит — тряски нет')
ok(run(createShakeDetector(), [...still(0, 500), ...bump(500), ...still(700, 2000)]).length === 0, 'один толчок (положил на стол) — не тряска')
ok(run(createShakeDetector(), [...still(0, 500), ...bump(500), ...still(700, 1700), ...bump(1700), ...still(1900, 3000)]).length === 0, 'два толчка с паузой больше секунды — не тряска')
const walk = Array.from({ length: 30 }, (_, i) => [i % 2 ? 2 : -2, i % 2 ? 1.5 : -1.5, 9.8 + (i % 2 ? 1 : -1), i * 100])
ok(run(createShakeDetector(), walk).length === 0, 'ходьба с телефоном в руке — не тряска')
const one = run(createShakeDetector(), [...still(0, 300), ...shake(300)])
ok(one.length === 1, 'потряс туда-обратно — одно срабатывание')
ok(one[0] >= 0 && one[0] <= 1, `сила 0..1 (${one[0]})`)
const light = run(createShakeDetector(), [...still(0, 300), ...shake(300, 8)])[0]
const hard = run(createShakeDetector(), [...still(0, 300), ...shake(300, 30)])[0]
ok(light < hard && hard === 1, `сильнее тряска — больше сила (${light} < ${hard}), не больше 1`)
ok(run(createShakeDetector(), [...shake(0), ...shake(400), ...shake(800)]).length === 1, 'тряска подряд — одно срабатывание, пока точки садятся')
ok(run(createShakeDetector(), [...shake(0), ...shake(SHAKE_COOLDOWN_MS + 400)]).length === 2, 'после паузы — снова срабатывает')
ok(run(createShakeDetector(), [[12, 0, 9.8, 0], [-12, 0, 9.8, 20], [12, 0, 9.8, 40], [-12, 0, 9.8, 60]]).length === 0, 'замеры чаще 80 мс не считаются отдельными рывками')
ok(run(createShakeDetector(), [[null, 0, 9.8, 0], [NaN, 1, 2, 100], [undefined, 0, 0, 200]]).length === 0, 'нет данных датчика — без ошибок и срабатываний')

// --- Волна ---
const seq = (vals) => {
  let i = 0
  return () => vals[i++ % vals.length]
}
const weak = sparkWaveAmps(5, 0, seq([0, 1, 0.5]))
const strong = sparkWaveAmps(5, 1, seq([0, 1, 0.5]))
ok(weak.length === 5 && strong.length === 5, 'размах на каждую точку')
ok(strong.every((a) => a < 0) && weak.every((a) => a < 0), 'волна начинается вверх')
ok(Math.min(...strong) < Math.min(...weak), 'сильная тряска — волна выше')
ok(sparkWaveAmps(8, 5, () => 1).every((a) => a >= -40), 'не улетают: размах ≤40px')
ok(sparkWaveAmps(0, 1).length === 0 && sparkWaveAmps(-3, 1).length === 0, 'нет точек — пустой список')

const lift = (i, t) => sparkWaveLift(-30, i, t)
ok(lift(0, 0) === 0, 'в момент тряски точка ещё на линии')
ok(lift(0, 60) < -10, 'первая точка сразу идёт вверх')
ok(lift(3, 60) === 0 && lift(3, 3 * SPARK_WAVE_STAGGER_MS + 60) < -10, 'следующие стартуют позже — волна бежит слева направо')
const path = Array.from({ length: 100 }, (_, k) => lift(0, k * 10))
ok(path.some((y) => y > 0), 'после подъёма проваливается ниже — качается')
ok(Math.max(...path.map(Math.abs)) <= 30, 'не выше заданного размаха')
ok(Math.abs(lift(0, 900)) < 1.5, 'к концу почти затухла')
ok(lift(0, SPARK_WAVE_POINT_MS) === 0 && lift(6, sparkWaveDuration(7)) === 0, 'после волны все точки ровно на месте')
ok(sparkWaveDuration(7) === SPARK_WAVE_POINT_MS + 6 * SPARK_WAVE_STAGGER_MS, 'длительность — до последней точки')
ok(sparkWaveLift(NaN, 0, 100) === 0, 'нет размаха — без смещения')
ok(sparkWaveDuration(7) < SHAKE_COOLDOWN_MS, 'волна успевает затихнуть до следующей тряски')

// --- Подсказка ---
ok(shakeHintMode({ support: 'none' }) === null, 'компьютер / «уменьшение движения» — подсказки нет')
ok(shakeHintMode({ support: 'open', views: 1 }) === 'try', 'Android — «Потрясите телефон» показывает анимацию')
ok(shakeHintMode({ support: 'ask', views: 1 }) === 'ask', 'iPhone — кнопка спрашивает разрешение')
ok(shakeHintMode({ support: 'open', done: true, views: 1 }) === null, 'уже тряс / нажал / отказал — подсказки нет')
ok(shakeHintMode({ support: 'ask', views: SHAKE_HINT_MAX_VIEWS }) === 'ask', `${SHAKE_HINT_MAX_VIEWS}-й заход — ещё показываем`)
ok(shakeHintMode({ support: 'ask', views: SHAKE_HINT_MAX_VIEWS + 1 }) === null, 'дальше не надоедаем')

if (failed) {
  console.error(`\nverify-spark-shake: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-spark-shake: all ok')
