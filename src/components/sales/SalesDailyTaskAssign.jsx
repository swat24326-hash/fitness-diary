import { useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { IskraDispatchModal } from '../iskra/IskraDispatchModal.jsx'
import { buildSalesReportTaskDraft } from '../../lib/admin/staffTaskCreateCore.js'
import { useClubDispatchRecipients } from '../../hooks/useClubDispatchRecipients.js'

/**
 * Кнопка «Задание» на дневном отчёте продаж (O2).
 * @param {{
 *   clubId: string,
 *   reportDate: string,
 *   clubName?: string,
 * }} props
 */
export function SalesDailyTaskAssign({ clubId, reportDate, clubName = '' }) {
  const [open, setOpen] = useState(false)
  const { recipients, loading } = useClubDispatchRecipients(clubId, { includeSalesManagers: true })

  const draft = useMemo(
    () =>
      buildSalesReportTaskDraft({
        clubId,
        reportDate,
        clubName: clubName || 'клуб',
      }),
    [clubId, reportDate, clubName],
  )

  if (!clubId || !reportDate) return null

  const canOpen = recipients.length > 0 && !loading

  return (
    <>
      <div className="sales-report__assign-bar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!canOpen}
          title={
            canOpen
              ? 'Поставить задание по этому дню отчёта'
              : loading
                ? 'Загрузка исполнителей…'
                : 'Нет исполнителей в клубе'
          }
          onClick={() => setOpen(true)}
        >
          <ClipboardList size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          Задание по отчёту
        </button>
        <span className="muted sales-report__assign-hint">Исполнителю — ссылка на этот день</span>
      </div>
      <IskraDispatchModal
        open={open}
        onClose={() => setOpen(false)}
        clubId={clubId}
        clubName={clubName}
        recipients={recipients}
        trainers={recipients}
        defaultDraft={draft}
        defaultRecipientId=""
        manualMode={false}
      />
    </>
  )
}
