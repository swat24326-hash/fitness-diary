import { Trash2 } from 'lucide-react'
import { AdminMembershipTypeRenameButton } from './AdminMembershipTypeRenameButton.jsx'
import { membershipTypeCountsTowardPayPlan } from '../../lib/admin/trainerPayTiersCore.js'

export function AdminMembershipTypeZoneBadge({ zone }) {
  const label = zone === 'az' ? 'АЗ' : 'ПЗ'
  return <span className={`admin-mt-badge admin-mt-badge--${zone}`}>{label}</span>
}

/**
 * Таблица ПЗ: ставки ур. 1–3 + галочка «В план».
 * @param {{
 *   items: object[],
 *   payDraft: Record<string, { l1: string, l2: string, l3: string }>,
 *   busy: boolean,
 *   paySavingId: string | null,
 *   planSavingId?: string | null,
 *   onPayTierChange: (typeId: string, level: string, value: string) => void,
 *   onPayBlur: (typeId: string) => void,
 *   onPlanToggle: (typeId: string, next: boolean) => void,
 *   onRename: (type: object, code: string) => Promise<{ ok?: boolean, error?: string } | void>,
 *   onRequestDeactivate: (typeId: string) => void,
 * }} props
 */
export function AdminMembershipTypesPzPayTable({
  items,
  payDraft,
  busy,
  paySavingId,
  planSavingId = null,
  onPayTierChange,
  onPayBlur,
  onPlanToggle,
  onRename,
  onRequestDeactivate,
}) {
  if (!items?.length) {
    return <p className="muted admin-mt-catalog__empty">Список ПЗ пуст.</p>
  }

  return (
    <div className="table-wrap admin-mt-table">
      <table>
        <thead>
          <tr>
            <th className="admin-mt-table__zone">Зал</th>
            <th>Тип</th>
            <th title="Учитывать тренировки по этому типу в порогах «План ЗП»">В план</th>
            <th title="Уровень 1 — базовая ставка">Ур. 1 ₽</th>
            <th title="Уровень 2 — средний порог тренировок">Ур. 2 ₽</th>
            <th title="Уровень 3 — максимум / без плана">Ур. 3 ₽</th>
            <th>Статус</th>
            <th style={{ width: 104 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((t) => {
            const draft = payDraft[t.id] ?? { l1: '', l2: '', l3: '' }
            const saving = busy || paySavingId === t.id || planSavingId === t.id
            const inPlan = membershipTypeCountsTowardPayPlan(t)
            return (
              <tr key={t.id} className={t.is_active === false ? 'muted' : undefined}>
                <td className="admin-mt-table__zone">
                  <AdminMembershipTypeZoneBadge zone="pz" />
                </td>
                <td>
                  <strong>{t.code}</strong>
                </td>
                <td>
                  <label className="admin-mt-plan-check">
                    <input
                      type="checkbox"
                      checked={inPlan}
                      disabled={saving}
                      onChange={(e) => onPlanToggle(t.id, e.target.checked)}
                      aria-label={`${t.code}: идёт в план ЗП`}
                      title="Идёт в план ЗП (пороги тренировок месяца)"
                    />
                  </label>
                </td>
                {(['l1', 'l2', 'l3']).map((level, idx) => (
                  <td key={level}>
                    <input
                      className="input admin-mt-pay-tier"
                      type="text"
                      inputMode="decimal"
                      aria-label={`${t.code}: ставка уровня ${idx + 1}`}
                      value={draft[level] ?? ''}
                      disabled={saving}
                      onChange={(e) => onPayTierChange(t.id, level, e.target.value)}
                      onBlur={() => onPayBlur(t.id)}
                    />
                  </td>
                ))}
                <td>{t.is_active === false ? 'Отключён' : 'Активен'}</td>
                <td>
                  <div className="admin-mt-table__actions">
                    <AdminMembershipTypeRenameButton
                      type={t}
                      disabled={busy}
                      busy={saving}
                      onRename={onRename}
                    />
                    {t.is_active !== false ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-square"
                        aria-label={`Отключить тип ${t.code}`}
                        title="Отключить"
                        disabled={busy}
                        onClick={() => onRequestDeactivate(t.id)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
