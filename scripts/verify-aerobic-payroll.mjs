import {
  aggregateAerobicPayrollFromDailyRows,
  buildAerobicPayRateMap,
  computeAerobicPayrollFromRows,
  parseAerobicPayRate,
} from '../src/lib/admin/aerobicPayrollCore.js'
import { aerobicInputMapToRows, aggregateAerobicSalesFromDailyRows, normalizeAerobicRowsFromDb } from '../src/lib/admin/aerobicSalesMatrix.js'
import { computeNetProfitWithPayroll } from '../src/lib/admin/trainerPayrollCore.js'
import { normalizeMembershipTypePushPayload } from '../src/lib/admin/membershipTypePushPayload.js'
import {
  filterAerobicSalesTypes,
  filterTrainerAssignableTypes,
  isAerobicSalesMembershipType,
  isTrainerAssignableMembershipType,
} from '../src/lib/membershipTypesCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parseAerobicPayRate('1200') === 1200, 'parse aerobic pay rate')
ok(isTrainerAssignableMembershipType({ trainer_assignable: true }), 'trainer type assignable')
ok(!isTrainerAssignableMembershipType({ trainer_assignable: false }), 'aerobic type not assignable')
ok(isAerobicSalesMembershipType({ trainer_assignable: false }), 'aerobic sales type')

const types = [
  { id: 'az1', trainer_assignable: false, aerobic_pay_amount: 500 },
  { id: 'az2', trainer_assignable: false, aerobic_pay_amount: 300 },
  { id: 'tr1', trainer_assignable: true, trainer_pay_per_session: 800 },
]
ok(filterAerobicSalesTypes(types).length === 2, 'filter aerobic types')
ok(filterTrainerAssignableTypes(types).length === 1, 'filter trainer types')

const rateMap = buildAerobicPayRateMap(filterAerobicSalesTypes(types))
const rows = [
  { membership_type_id: 'az1', count: 2 },
  { membership_type_id: 'az2', count: 1 },
]
const dayPay = computeAerobicPayrollFromRows(rows, rateMap)
ok(dayPay.clubTotal === 1300, 'aerobic day payroll')

const monthPay = aggregateAerobicPayrollFromDailyRows(
  [{ aerobic_sales_matrix: rows }, { aerobic_sales_matrix: [{ membership_type_id: 'az1', count: 1 }] }],
  rateMap,
)
ok(monthPay.clubTotal === 1800, 'aerobic month payroll aggregated')

const parsed = aerobicInputMapToRows({ az1: '3' }, filterAerobicSalesTypes(types))
ok(parsed.ok && parsed.rows[0].count === 3, 'aerobic input map to rows')

const normalized = normalizeAerobicRowsFromDb([{ membership_type_id: 'az1', count: 2.9 }])
ok(normalized[0].count === 2, 'normalize aerobic rows')

ok(computeNetProfitWithPayroll(10000, 3100, 2000, 1300) === 3600, 'net profit with aerobic payroll')

const azPush = normalizeMembershipTypePushPayload(
  { id: 'x', club_id: 'c', code: 'Бокс', trainer_assignable: false, aerobic_pay_amount: 200 },
  { insert: true },
)
ok(azPush.ok && azPush.data.trainer_assignable === false, 'push payload keeps trainer_assignable false')
ok(azPush.data.aerobic_pay_amount === 200, 'push payload keeps aerobic_pay_amount')

const monthAgg = aggregateAerobicSalesFromDailyRows(
  [
    { aerobic_sales_matrix: [{ membership_type_id: 'az1', count: 2 }] },
    { aerobic_sales_matrix: [{ membership_type_id: 'az1', count: 1 }, { membership_type_id: 'az2', count: 4 }] },
  ],
  types,
)
ok(monthAgg.total === 7, 'aerobic month aggregate total')
ok(monthAgg.byType.find((x) => x.typeId === 'az2')?.count === 4, 'aerobic month by type')

process.exit(failed > 0 ? 1 : 0)
