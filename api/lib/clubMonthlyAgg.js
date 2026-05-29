function monthKey(iso) {
  return String(iso ?? '').slice(0, 7)
}

function buildMonthKeys(anchorToIso, months) {
  const to = String(anchorToIso ?? '').slice(0, 10)
  const y = Number(to.slice(0, 4))
  const m1 = Number(to.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m1)) return []
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(y, m1 - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function aggregateMonthlyTypedCompleted({ trainings, memberships, anchorTo, months }) {
  const membershipTypeById = new Map()
  for (const m of memberships ?? []) {
    const id = String(m?.id ?? '').trim()
    if (!id) continue
    const tid = String(m?.membership_type_id ?? '').trim()
    membershipTypeById.set(id, tid || null)
  }

  const keys = buildMonthKeys(anchorTo, months)
  const counts = new Map(keys.map((k) => [k, 0]))

  for (const t of trainings ?? []) {
    if (t?.status !== 'completed') continue
    const mid = String(t?.data?.membership_id ?? '').trim()
    if (!mid) continue
    const tid = membershipTypeById.get(mid)
    if (!tid) continue // без типа не считаем
    const mk = monthKey(t?.date)
    if (!mk || !counts.has(mk)) continue
    counts.set(mk, (counts.get(mk) || 0) + 1)
  }

  return keys.map((k) => ({ month: k, count: counts.get(k) || 0 }))
}

