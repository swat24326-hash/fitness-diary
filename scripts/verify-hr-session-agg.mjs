/**
 * Агрегат пульса сессии (зоны, Keytel).
 * node scripts/verify-hr-session-agg.mjs
 */
import {
  HR_SAMPLE_INTERVAL_MS,
  HR_SESSION_MAX_SPAN_MS,
  ageYearsFromBirthDate,
  aggregateHrSamples,
  appendHrSample,
  buildHrSessionSummary,
  computeHrZonePercents,
  estimateKcalKeytel,
  estimateMaxHr,
  hrZoneForBpm,
  normalizeHrSessionSnapshot,
  pruneHrSamplesToRecentWindow,
} from '../src/lib/hr/hrSessionAgg.js'
import {
  buildHrMinuteSeries,
  buildHrSessionGoalRings,
  hrSessionTargetVerdict,
  hrTargetRangeFromMaxHr,
  hrZoneBoundsBpm,
  hrZoneMethodRows,
} from '../src/lib/hr/hrSessionInsightCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(ageYearsFromBirthDate('1990-07-28', '2026-07-28') === 36, 'возраст 36')
ok(ageYearsFromBirthDate('bad') === null, 'плохая ДР')
ok(estimateMaxHr(36) === 184, 'макс ЧСС 220-36')
ok(hrZoneForBpm(100, 184) === 'easy', 'зона лёгкая')
ok(hrZoneForBpm(130, 184) === 'mid', 'зона средняя')
ok(hrZoneForBpm(160, 184) === 'hard', 'зона высокая')

{
  const kcalM = estimateKcalKeytel({
    avgBpm: 140,
    weightKg: 80,
    ageYears: 30,
    sex: 'male',
    durationMin: 45,
  })
  ok(kcalM != null && kcalM > 100 && kcalM < 1200, `Keytel муж ~${kcalM}`)
  const kcalF = estimateKcalKeytel({
    avgBpm: 140,
    weightKg: 60,
    ageYears: 30,
    sex: 'female',
    durationMin: 45,
  })
  ok(kcalF != null && kcalF > 50 && kcalF < 900, `Keytel жен ~${kcalF}`)
  ok(estimateKcalKeytel({ avgBpm: 140, weightKg: 80, ageYears: 30, sex: null, durationMin: 45 }) === null, 'без пола — null')
}

{
  const t0 = 1_000_000
  const samples = [
    { t: t0, bpm: 100 },
    { t: t0 + 60_000, bpm: 140 },
    { t: t0 + 120_000, bpm: 160 },
  ]
  const agg = aggregateHrSamples(samples)
  ok(agg?.min === 100 && agg?.max === 160 && agg?.avg === 133, 'agg min/avg/max')
  ok(agg?.duration_sec === 120, 'duration 120s')
  ok(agg?.samples_n === 3, 'samples_n')

  const zones = computeHrZonePercents(samples, 184)
  ok(zones && zones.easy_pct + zones.mid_pct + zones.hard_pct === 100, 'зоны 100%')
  ok(zones.hard_pct === 33 || zones.hard_pct === 34, `hard ~33 got ${zones.hard_pct}`)
}

{
  const summary = buildHrSessionSummary(
    [
      { t: 0, bpm: 120 },
      { t: 300_000, bpm: 130 },
    ],
    { birthDate: '1990-01-01', sex: 'male', weightKg: 80, asOfIso: '2026-07-28' },
  )
  ok(summary?.avg === 125, 'summary avg')
  ok(summary?.zones != null, 'summary zones')
  ok(summary?.kcal_est != null && summary.kcal_est > 0, 'summary kcal')
  ok(summary?.max_hr === 184, 'summary max_hr 220-36')
  ok(summary?.target?.lo === 111 && summary?.target?.hi === 147, `target ${summary?.target?.lo}-${summary?.target?.hi}`)
  ok(Array.isArray(summary?.series) && summary.series.length >= 2, 'summary series')
  ok(normalizeHrSessionSnapshot(summary)?.avg === 125, 'normalize roundtrip')
  ok(normalizeHrSessionSnapshot(summary)?.series?.length >= 2, 'normalize keeps series')
  ok(buildHrSessionSummary([]) === null, 'empty samples')
  ok(
    buildHrSessionSummary([{ t: 0, bpm: 120 }], { birthDate: '1990-01-01' })?.kcal_est == null,
    'без пола/веса — без ккал',
  )
}

{
  const b = hrZoneBoundsBpm(184)
  ok(b?.mid_lo === 111 && b?.hard_lo === 148, `bounds mid/hard ${b?.mid_lo}/${b?.hard_lo}`)
  ok(hrTargetRangeFromMaxHr(184)?.lo === 111, 'target from maxHr')
  ok(hrSessionTargetVerdict({ easy_pct: 95, mid_pct: 5, hard_pct: 0 }) === 'Почти всё время ниже цели', 'verdict below')
  ok(hrSessionTargetVerdict({ easy_pct: 10, mid_pct: 70, hard_pct: 20 }) === 'Большая часть времени в цели', 'verdict in target')
  ok(hrSessionTargetVerdict({ easy_pct: 10, mid_pct: 20, hard_pct: 70 }) === 'Часто выше цели', 'verdict above')

  const series = buildHrMinuteSeries([
    { t: 0, bpm: 100 },
    { t: 30_000, bpm: 110 },
    { t: 60_000, bpm: 140 },
    { t: 120_000, bpm: 150 },
  ])
  ok(series?.length === 3, `minute series len ${series?.length}`)
  ok(series?.[0] === 105 && series?.[1] === 140 && series?.[2] === 150, `series values ${series}`)

  const rows = hrZoneMethodRows(184)
  ok(rows?.length === 3, 'method rows 3')
  ok(rows[0].method_pct === '<60%' && rows[0].bpm_range === '<111', 'easy method')
  ok(rows[1].is_target && rows[1].method_pct === '60–80%' && rows[1].bpm_range === '111–147', 'mid = цель')
  ok(rows[2].method_pct === '≥80%' && rows[2].bpm_range === '≥148', 'hard method')

  const goalRings = buildHrSessionGoalRings({
    zones: { easy_pct: 95, mid_pct: 5, hard_pct: 0 },
    durationMin: 30,
  })
  ok(goalRings?.length === 3, 'goal rings 3')
  ok(Math.abs(goalRings[0].fill - 0.1) < 0.001, `target fill 5/50=${goalRings[0].fill}`)
  ok(Math.abs(goalRings[1].fill - 5 / 60) < 0.001, 'load fill mid+hard / 60')
  ok(Math.abs(goalRings[2].fill - 0.5) < 0.001, 'time 30/60 = half')
  const fullTarget = buildHrSessionGoalRings({
    zones: { easy_pct: 20, mid_pct: 55, hard_pct: 25 },
    durationMin: 60,
  })
  ok(fullTarget?.[0].fill === 1 && fullTarget?.[1].fill === 1 && fullTarget?.[2].fill === 1, 'all rings full')
}

{
  let buf = []
  buf = appendHrSample(buf, 100, 1000)
  ok(buf.length === 1 && buf[0].bpm === 100, 'первый сэмпл')
  buf = appendHrSample(buf, 110, 1000 + 100)
  ok(buf.length === 1 && buf[0].bpm === 110, 'downsample обновляет последний')
  buf = appendHrSample(buf, 120, 1000 + HR_SAMPLE_INTERVAL_MS + 50)
  ok(buf.length === 2 && buf[1].bpm === 120, 'новый сэмпл после интервала')
}

{
  const last = 10_000_000
  const stale = [
    { t: last - HR_SESSION_MAX_SPAN_MS - 60_000, bpm: 50 },
    { t: last - 60_000, bpm: 100 },
    { t: last, bpm: 120 },
  ]
  const pruned = pruneHrSamplesToRecentWindow(stale)
  ok(pruned.length === 2 && pruned[0].bpm === 100, 'prune отбрасывает хвост старше окна')
  const agg = aggregateHrSamples(stale)
  ok(agg?.duration_sec === 60, 'duration по окну, не по дням')
  ok(agg?.min === 100 && agg?.avg === 110, 'agg без stale bpm')
}

console.log('verify-hr-session-agg: all passed')
