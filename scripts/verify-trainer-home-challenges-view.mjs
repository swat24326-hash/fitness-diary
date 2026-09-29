/**
 * node scripts/verify-trainer-home-challenges-view.mjs
 */
import {
  INITIAL_CHALLENGES_VIEW,
  challengesViewLoading,
  challengesViewOnError,
  challengesViewReady,
} from '../src/lib/trainer/trainerHomeChallengesViewCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  }
}

const item = { challenge: { id: 'c1' }, mine: [], totalRanked: 0 }

ok(INITIAL_CHALLENGES_VIEW.phase === 'loading', 'старт — loading')

const loading = challengesViewLoading(challengesViewReady([item]))
ok(loading.phase === 'loading' && loading.items.length === 1, 'loading сохраняет прошлый список')

const keep = challengesViewOnError(challengesViewReady([item]))
ok(keep.phase === 'ready' && keep.items[0] === item, 'ошибка при last-good — список остаётся')

const keepDuringLoading = challengesViewOnError(loading)
ok(keepDuringLoading.phase === 'ready' && keepDuringLoading.items.length === 1, 'ошибка во время загрузки — last-good остаётся')

const err = challengesViewOnError(INITIAL_CHALLENGES_VIEW)
ok(err.phase === 'error' && err.items.length === 0, 'ошибка без списка — phase error, а не «пусто»')

ok(challengesViewOnError(undefined).phase === 'error', 'ошибка без prev — error')

const empty = challengesViewReady([])
ok(empty.phase === 'ready' && empty.items.length === 0, 'честно пусто — ready без элементов')
ok(challengesViewReady(null).items.length === 0, 'ready(null) — пустой массив')

if (failed) {
  console.error(`verify-trainer-home-challenges-view: ${failed} fail(s)`)
  process.exit(1)
}
console.log('verify-trainer-home-challenges-view: ok')
