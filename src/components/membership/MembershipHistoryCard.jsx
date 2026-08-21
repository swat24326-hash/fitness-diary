/**
 * Список абонементов клиента: легенда статусов + таблица.
 */

import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { completedTrainingsOnMembership } from '../../lib/membershipRules'
import {
  isMembershipTotalBroken,
  membershipBrokenTotalHintRu,
  resolveEffectiveMembershipUsed,
} from '../../lib/membership/membershipTotalGuardCore.js'
import { formatDateRu, formatDateTimeRu } from '../../lib/dateRu'
import { membershipTypeCode } from '../../lib/membershipTypesService'
import { formatMembershipPaidAmountCell } from '../../lib/admin/membershipPaidAmountCore.js'
import { ClientRowMoreMenu } from '../ClientRowMoreMenu'
import { MembershipStatusIcon, membershipVisualKind } from './MembershipStatusIcon.jsx'

/**
 * @param {{
 *   preferPaidType?: boolean,
 *   showPaidAmount?: boolean,
 *   historySorted: object[],
 *   trainings: object[],
 *   typesById: Map<string, object>,
 *   todayIso: string,
 *   formatTypeCell: (typeId: string) => string,
 *   onOpenNew: () => void,
 *   onView: (m: object) => void,
 *   onEdit: (m: object) => void,
 *   onDelete: (m: object) => void,
 * }} props
 */
export function MembershipHistoryCard({
  preferPaidType = false,
  showPaidAmount = false,
  historySorted,
  trainings,
  typesById,
  todayIso,
  formatTypeCell,
  onOpenNew,
  onView,
  onEdit,
  onDelete,
}) {
  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Абонементы</h3>
        <button
          type="button"
          className={preferPaidType ? 'btn btn-primary btn-touch' : 'btn btn-primary btn-icon-square'}
          aria-label={preferPaidType ? 'Оформить платный абонемент' : 'Новый абонемент'}
          title={preferPaidType ? 'Оформить платный абонемент' : 'Новый абонемент'}
          onClick={onOpenNew}
        >
          <Plus size={16} aria-hidden style={preferPaidType ? { marginRight: 6, verticalAlign: -2 } : undefined} />
          {preferPaidType ? 'Оформить платный' : null}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span className="row" style={{ gap: 8, alignItems: 'center' }}>
          <MembershipStatusIcon kind="active" /> действует
        </span>
        <span className="row" style={{ gap: 8, alignItems: 'center' }}>
          <MembershipStatusIcon kind="depleted" /> лимит
        </span>
        <span className="row" style={{ gap: 8, alignItems: 'center' }}>
          <MembershipStatusIcon kind="broken_total" /> {membershipBrokenTotalHintRu()}
        </span>
        <span className="row" style={{ gap: 8, alignItems: 'center' }}>
          <MembershipStatusIcon kind="no_window" /> срок
        </span>
      </div>
      {historySorted.length === 0 && <p className="muted">Пока нет записей.</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Период</th>
              <th className="mem-col-type">Тип</th>
              <th>Статус</th>
              <th>Использовано</th>
              {showPaidAmount ? <th>Оплата</th> : null}
              <th>Создан</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {historySorted.map((m) => {
              const usedEff = resolveEffectiveMembershipUsed(
                m.used_trainings,
                completedTrainingsOnMembership(m, trainings).length,
              )
              const totalN = Number(m.total_trainings ?? 0)
              const broken = isMembershipTotalBroken({
                totalTrainings: totalN,
                usedEffective: usedEff,
              })
              return (
                <tr key={m.id}>
                  <td>
                    {formatDateRu(m.start_date)} — {formatDateRu(m.end_date)}
                  </td>
                  <td className="mem-col-type" title={membershipTypeCode(typesById, m.membership_type_id) || undefined}>
                    {formatTypeCell(m.membership_type_id)}
                  </td>
                  <td style={{ width: 56 }}>
                    <MembershipStatusIcon kind={membershipVisualKind(m, todayIso, usedEff)} />
                  </td>
                  <td
                    title={broken ? membershipBrokenTotalHintRu() : undefined}
                    style={broken ? { color: 'var(--warning, #f59e0b)', fontWeight: 600 } : undefined}
                  >
                    {usedEff}/{m.total_trainings ?? '—'}
                    {broken ? (
                      <span className="muted" style={{ display: 'block', fontSize: 11, fontWeight: 500 }}>
                        {membershipBrokenTotalHintRu()}
                      </span>
                    ) : null}
                  </td>
                  {showPaidAmount ? (
                    <td title="Цена пакета на абонементе">{formatMembershipPaidAmountCell(m.paid_amount)}</td>
                  ) : null}
                  <td className="muted">{formatDateTimeRu(m.created_at)}</td>
                  <td style={{ width: 56 }}>
                    <div className="mem-actions">
                      <ClientRowMoreMenu
                        ariaLabel="Действия с абонементом"
                        items={[
                          {
                            id: 'view',
                            label: 'Тренировки',
                            icon: Eye,
                            onSelect: () => onView(m),
                          },
                          {
                            id: 'edit',
                            label: 'Редактировать',
                            icon: Pencil,
                            onSelect: () => onEdit(m),
                          },
                          {
                            id: 'delete',
                            label: 'Удалить',
                            icon: Trash2,
                            danger: true,
                            onSelect: () => onDelete(m),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
