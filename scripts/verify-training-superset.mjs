import {
  cleanupSupersetGroups,
  groupExercisesForDisplay,
  isJoinedWithPrevious,
  toggleSupersetWithPrevious,
} from '../src/lib/trainingSuperset.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const ex = (id, group = null) => ({ id, name: id, superset_group: group })

let list = [ex('a'), ex('b'), ex('c')]
list = toggleSupersetWithPrevious(list, 1)
ok(isJoinedWithPrevious(list, 1), 'join a+b')
ok(list[0].superset_group === 'A' && list[1].superset_group === 'A', 'same group A')

list = toggleSupersetWithPrevious(list, 2)
ok(list[2].superset_group === 'A', 'third in superset A')

let chain = [ex('x'), ex('y'), ex('z'), ex('w')]
chain = toggleSupersetWithPrevious(chain, 1)
chain = toggleSupersetWithPrevious(chain, 2)
chain = toggleSupersetWithPrevious(chain, 3)
ok(!isJoinedWithPrevious(chain, 3), 'max 3 — fourth not joined')

list = toggleSupersetWithPrevious([ex('p', 'A'), ex('q', 'A')], 1)
ok(!list[1].superset_group && !list[0].superset_group, 'toggle off clears pair')

const cleaned = cleanupSupersetGroups([ex('solo', 'B')])
ok(!cleaned[0].superset_group, 'orphan group removed')

const grouped = groupExercisesForDisplay([ex('1', 'A'), ex('2', 'A'), ex('3')])
ok(grouped.length === 2 && grouped[0].kind === 'superset' && grouped[0].items.length === 2, 'display grouping')

if (failed) process.exit(1)
console.log('verify-training-superset: all passed')
