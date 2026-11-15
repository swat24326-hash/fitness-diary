import { useCallback, useState } from 'react'
import { AdminClubDaySummaryPanel } from '../admin/AdminClubDaySummaryPanel.jsx'
import { ClubCallShiftSummaryPanel } from '../admin/ClubCallShiftSummaryPanel.jsx'
import { loadAdminClubDaySummary } from '../../lib/admin/adminClubDaySummaryService.js'
import { loadClubCallShiftSummary } from '../../lib/admin/clubCallShiftSummaryService.js'
import { shouldReloadAdminDaySummary } from '../../lib/admin/adminClubDaySummaryCore.js'
import {
  daySummaryGlanceLooksSame,
  isDaySummaryGlanceFresh,
  peekDaySummaryGlanceSession,
  readDaySummaryGlanceSession,
  writeDaySummaryGlanceSession,
} from '../../lib/admin/daySummaryGlanceSession.js'
import {
  clubCallShiftGlanceLooksSame,
  isClubCallShiftGlanceFresh,
  peekClubCallShiftGlanceSession,
  readClubCallShiftGlanceSession,
  writeClubCallShiftGlanceSession,
} from '../../lib/admin/clubCallShiftGlanceSession.js'
import { useStaleWhileRevalidate } from '../../hooks/useStaleWhileRevalidate.js'
import { useDebouncedStorageReload } from '../../lib/useDebouncedStorageReload.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'

/**
 * Сводка дня + связь за день на главной менеджера (как у админа, без «Качества ведения»).
 * @param {{ clubId: string }} props
 */
export function SalesHomeDaySummaries({ clubId = '' }) {
  const cid = String(clubId ?? '').trim()
  const clubDayIso = todayInTimeZoneIso()
  const [callShiftNotice, setCallShiftNotice] = useState('')

  const peekDay = useCallback(
    () => (cid ? peekDaySummaryGlanceSession(cid, clubDayIso) : null),
    [cid, clubDayIso],
  )
  const readDay = useCallback(
    () => (cid ? readDaySummaryGlanceSession(cid, clubDayIso) : null),
    [cid, clubDayIso],
  )
  const writeDay = useCallback(
    (summary) => {
      if (cid) writeDaySummaryGlanceSession(cid, clubDayIso, summary)
    },
    [cid, clubDayIso],
  )
  const fetchDaySummary = useCallback(async () => {
    if (!cid) return null
    const res = await loadAdminClubDaySummary(cid)
    return res.ok ? res.summary : null
  }, [cid])

  const {
    data: daySummary,
    loading: daySummaryLoading,
    reload: reloadDaySummary,
  } = useStaleWhileRevalidate({
    enabled: Boolean(cid),
    deps: [cid, clubDayIso],
    peek: peekDay,
    read: readDay,
    write: writeDay,
    isFresh: isDaySummaryGlanceFresh,
    looksSame: daySummaryGlanceLooksSame,
    fetcher: fetchDaySummary,
  })

  const peekShift = useCallback(
    () => (cid ? peekClubCallShiftGlanceSession(cid, clubDayIso) : null),
    [cid, clubDayIso],
  )
  const readShift = useCallback(
    () => (cid ? readClubCallShiftGlanceSession(cid, clubDayIso) : null),
    [cid, clubDayIso],
  )
  const writeShift = useCallback(
    (summary) => {
      if (cid) writeClubCallShiftGlanceSession(cid, clubDayIso, summary)
    },
    [cid, clubDayIso],
  )
  const fetchShiftSummary = useCallback(async () => {
    if (!cid) {
      setCallShiftNotice('')
      return null
    }
    const res = await loadClubCallShiftSummary(cid, { day: clubDayIso })
    if (!res.ok) {
      const cached = peekClubCallShiftGlanceSession(cid, clubDayIso)
      if (res.reason === 'offline') {
        setCallShiftNotice(
          cached ? 'Нет сети — на экране сохранённые цифры' : 'Нет сети — сводку загрузить нельзя',
        )
      } else {
        setCallShiftNotice(String(res.reason || 'Облако недоступно — цифры за день не загрузились'))
      }
      return null
    }
    setCallShiftNotice(res.partial ? String(res.reason || '') : '')
    return res.summary
  }, [cid, clubDayIso])

  const {
    data: callShiftSummary,
    loading: callShiftLoading,
    reload: reloadCallShift,
  } = useStaleWhileRevalidate({
    enabled: Boolean(cid),
    deps: [cid, clubDayIso],
    peek: peekShift,
    read: readShift,
    write: writeShift,
    isFresh: isClubCallShiftGlanceFresh,
    looksSame: clubCallShiftGlanceLooksSame,
    fetcher: fetchShiftSummary,
  })

  useDebouncedStorageReload(
    () => {
      void reloadDaySummary({ force: true })
      void reloadCallShift({ force: true })
    },
    { shouldRun: shouldReloadAdminDaySummary },
  )

  return (
    <div className="admin-home-summaries admin-home-summaries--no-cq sales-home__day-summaries">
      <AdminClubDaySummaryPanel
        summary={daySummary}
        clubId={cid}
        clientsPath="/sales/clients"
        statsPath="/sales"
        statsTab="stats"
        loading={daySummaryLoading}
        noClub={!cid}
        includeCoachQuality={false}
        onRetry={() => void reloadDaySummary({ force: true })}
      />
      <ClubCallShiftSummaryPanel
        summary={callShiftSummary}
        journalHref="/sales/call-log"
        loading={callShiftLoading}
        noClub={!cid}
        error={callShiftNotice}
      />
    </div>
  )
}
