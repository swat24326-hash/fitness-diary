/**
 * Окно сверху: история связи клиента (звонки + SMS; день или всё время до 90 дн.).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { AdminClubCallJournalSection } from './AdminClubCallJournalSection.jsx'
import { AdminClientClubCallButton } from './AdminClientClubCallButton.jsx'
import { AdminClientSmsHistoryPanel } from './AdminClientSmsHistoryPanel.jsx'
import { ClubOutreachRangeToggle } from './ClubOutreachRangeToggle.jsx'
import {
  acquireClubCallOverlayScrollLock,
  isClubCallSheetBackdropOpen,
} from '../../lib/admin/clubCallOverlayScrollLock.js'
import {
  CLIENT_OUTREACH_HISTORY_TABS,
  CLIENT_OUTREACH_RANGE_DAY,
  normalizeClientOutreachHistoryTab,
  normalizeClientOutreachRangeMode,
} from '../../lib/admin/clientOutreachHistoryRangeCore.js'
import { CLUB_CALL_LOG_MAX_LOOKBACK_DAYS } from '../../lib/admin/clubCallLogCore.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'
import '../../styles/club-call.css'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   clubId: string,
 *   client: { id: string, name?: string, phone?: string | null, club_id?: string },
 *   clubName?: string,
 *   configured?: boolean | null,
 *   reloadToken?: number,
 *   onFeedback?: (msg: string, tone?: string, opts?: { durationMs?: number }) => void,
 *   onCalled?: (clientId: string) => void,
 *   onNoteSaved?: () => void,
 * }} props
 */
export function AdminClientCallHistorySheet({
  open,
  onClose,
  clubId,
  client,
  clubName = '',
  configured = null,
  reloadToken = 0,
  onFeedback,
  onCalled,
  onNoteSaved,
}) {
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [tab, setTab] = useState('calls')
  const [rangeMode, setRangeMode] = useState(CLIENT_OUTREACH_RANGE_DAY)
  const [day, setDay] = useState(() => todayInTimeZoneIso())

  useEffect(() => {
    if (!open) return
    setTab('calls')
    setRangeMode(CLIENT_OUTREACH_RANGE_DAY)
    setDay(todayInTimeZoneIso())
  }, [open, client?.id])

  const requestClose = () => {
    if (isClubCallSheetBackdropOpen()) return
    onCloseRef.current?.()
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (isClubCallSheetBackdropOpen()) return
      onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    const release = acquireClubCallOverlayScrollLock()
    return () => {
      window.removeEventListener('keydown', onKey)
      release()
    }
  }, [open])

  if (!open || !client || typeof document === 'undefined') return null

  const name = String(client.name ?? '').trim() || 'Клиент'
  const phone = String(client.phone ?? '').trim()
  const activeTab = normalizeClientOutreachHistoryTab(tab)
  const activeRange = normalizeClientOutreachRangeMode(rangeMode)
  const callActions = (
    <AdminClientClubCallButton
      clubId={clubId}
      client={client}
      clubName={clubName}
      configured={configured}
      onFeedback={onFeedback}
      onCalled={onCalled}
      onNoteSaved={onNoteSaved}
    />
  )

  return createPortal(
    <div
      className="club-call-history-sheet-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div
        className="club-call-history-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="club-call-history-sheet__head">
          <div>
            <h2 id={titleId} className="club-call-history-sheet__title">
              История связи
            </h2>
            <p className="club-call-history-sheet__meta">
              {name}
              {phone ? ` · ${phone}` : ''}
            </p>
          </div>
          <div className="club-call-history-sheet__head-actions">
            {/* Трубка всегда смонтирована — смена вкладки SMS не срывает набор/пометку. */}
            {callActions}
            <button
              type="button"
              className="btn btn-ghost btn-icon-square btn-touch"
              aria-label="Закрыть"
              title="Закрыть"
              onClick={requestClose}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>

        <div className="club-outreach-history-tabs" role="tablist" aria-label="Тип истории">
          {CLIENT_OUTREACH_HISTORY_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`club-outreach-history-tabs__btn${activeTab === t.id ? ' club-outreach-history-tabs__btn--on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <ClubOutreachRangeToggle
          rangeMode={activeRange}
          day={day}
          onRangeModeChange={setRangeMode}
          onDayChange={setDay}
          lookbackDays={CLUB_CALL_LOG_MAX_LOOKBACK_DAYS}
        />

        <p className="muted club-call-history-sheet__hint">
          {activeTab === 'sms'
            ? 'SMS клуба этому человеку: статус, текст, кто отправил.'
            : 'Звонки с телефона клуба: исход, запись и пометка.'}
          {activeRange === 'all' ? ` Показаны до ${CLUB_CALL_LOG_MAX_LOOKBACK_DAYS} дн.` : ''}
        </p>

        {activeTab === 'calls' ? (
          <AdminClubCallJournalSection
            clubId={clubId}
            clientId={String(client.id)}
            embedded
            showHeading={false}
            showDayControls={false}
            rangeMode={activeRange}
            day={day}
            onDayChange={setDay}
            reloadToken={reloadToken}
          />
        ) : (
          <AdminClientSmsHistoryPanel
            clubId={clubId}
            clientId={String(client.id)}
            rangeMode={activeRange}
            day={day}
            reloadToken={reloadToken}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}
