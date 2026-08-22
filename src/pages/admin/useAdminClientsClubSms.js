import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchClubSmsStatus, fetchClubSmsLogs } from '../../lib/admin/clubSmsService.js'
import { listRecentClubSmsLogs } from '../../lib/admin/clubSmsLogService.js'
import {
  mapClubSmsMarksByClient,
  resolveClientClubSmsScenario,
} from '../../lib/admin/clubSmsSentMarkCore.js'
import { todayInTimeZoneIso } from '../../lib/dateRu.js'

/**
 * Статус клуба SMS, локальные/облачные логи и метки «уже писали» для строк списка.
 *
 * @param {{
 *   club: string,
 *   clients: object[],
 *   memByClient: Record<string, object[]>,
 *   quickFilter: string,
 * }} args
 */
export function useAdminClientsClubSms({ club, clients, memByClient, quickFilter }) {
  const today = todayInTimeZoneIso()
  const [clubSmsConfigured, setClubSmsConfigured] = useState(false)
  const [clubSmsTemplates, setClubSmsTemplates] = useState(null)
  const [clubSmsClubName, setClubSmsClubName] = useState('')
  /** @type {[object[], function]} */
  const [clubSmsLogs, setClubSmsLogs] = useState([])
  const [smsFeedback, setSmsFeedback] = useState(null)
  const [smsJournalOpen, setSmsJournalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!club) {
      setClubSmsConfigured(false)
      setClubSmsTemplates(null)
      setClubSmsClubName('')
      setClubSmsLogs([])
      return undefined
    }
    fetchClubSmsStatus(club)
      .then((r) => {
        if (cancelled) return
        setClubSmsConfigured(r.configured)
        setClubSmsTemplates(r.templates ?? null)
        setClubSmsClubName(r.clubName || '')
      })
      .catch(() => {
        if (!cancelled) {
          setClubSmsConfigured(false)
          setClubSmsTemplates(null)
          setClubSmsClubName('')
        }
      })
    void listRecentClubSmsLogs(club, { todayIso: todayInTimeZoneIso() }).then((rows) => {
      if (!cancelled) setClubSmsLogs(rows)
    })
    return () => {
      cancelled = true
    }
  }, [club])

  const onSmsFeedback = useCallback((msg, tone = 'ok', opts = {}) => {
    setSmsFeedback({ msg, tone })
    const ms = Number(opts?.durationMs) > 0 ? Number(opts.durationMs) : 4000
    window.setTimeout(() => setSmsFeedback(null), ms)
  }, [])

  const onClubSmsSent = useCallback(
    (clientId, scenario = 'custom') => {
      const id = String(clientId ?? '').trim()
      if (!id || !club) return
      const entry = {
        id: `local_${Date.now()}`,
        client_id: id,
        club_id: club,
        scenario: String(scenario || 'custom'),
        channel: 'club_sms',
        status: 'ok',
        created_at: new Date().toISOString(),
      }
      setClubSmsLogs((prev) => [...prev, entry])
    },
    [club],
  )

  const refreshClubSmsLogsFromCloud = useCallback(async () => {
    if (!club) return
    try {
      const cloud = await fetchClubSmsLogs(club, { sinceDays: 14 })
      if (Array.isArray(cloud)) {
        setClubSmsLogs(cloud)
        return
      }
    } catch {
      /* оставим локальный кэш */
    }
    try {
      const local = await listRecentClubSmsLogs(club, { todayIso: todayInTimeZoneIso() })
      setClubSmsLogs(local)
    } catch {
      /* ignore */
    }
  }, [club])

  const clientSmsScenarioById = useMemo(() => {
    /** @type {Record<string, string>} */
    const out = {}
    for (const c of clients ?? []) {
      const id = String(c?.id ?? '')
      if (!id) continue
      out[id] = resolveClientClubSmsScenario({
        client: c,
        memList: memByClient[id] ?? memByClient[c.id] ?? [],
        today,
      })
    }
    return out
  }, [clients, memByClient, today])

  const viewingSmsFilter = quickFilter === 'none' ? 'all' : quickFilter
  const clubSmsMarkByClient = useMemo(
    () =>
      mapClubSmsMarksByClient(clubSmsLogs, {
        today,
        viewingFilter: viewingSmsFilter,
        clientScenarioById: clientSmsScenarioById,
      }),
    [clubSmsLogs, today, viewingSmsFilter, clientSmsScenarioById],
  )

  return {
    clubSmsConfigured,
    clubSmsTemplates,
    clubSmsClubName,
    clubSmsLogs,
    smsFeedback,
    smsJournalOpen,
    setSmsJournalOpen,
    onSmsFeedback,
    onClubSmsSent,
    refreshClubSmsLogsFromCloud,
    viewingSmsFilter,
    clubSmsMarkByClient,
  }
}
