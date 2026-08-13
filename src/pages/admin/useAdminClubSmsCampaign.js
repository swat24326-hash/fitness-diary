import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildOutreachMessage,
} from '../../lib/trainer/trainerClientOutreachCore.js'
import { resolveClubSmsTemplates } from '../../lib/admin/clubSmsTemplatesCore.js'
import { appendClubSmsLog } from '../../lib/admin/clubSmsLogService.js'
import { sendClubSmsViaApi } from '../../lib/admin/clubSmsService.js'
import {
  clientHasSendableClubSmsPhone,
  normalizeClubSmsCampaignText,
  partitionClubSmsCampaignClients,
  resolveClubSmsCampaignRecipients,
  selectAllClubSmsCampaignEligible,
  toggleClubSmsCampaignSelection,
} from '../../lib/admin/clubSmsCampaignCore.js'
import { runClubSmsCampaign } from '../../lib/admin/clubSmsCampaignRunner.js'

/**
 * Состояние массовой SMS на доске клиентов (админ / менеджер / управляющий).
 *
 * @param {{
 *   clubId: string,
 *   filteredClients: object[],
 *   memByClient?: Record<string, object[]>,
 *   smsMode: { mode: string, scenario?: string | null, label?: string },
 *   clubName?: string,
 *   templates?: Record<string, string> | null,
 *   today?: string,
 *   trainerNameById?: Record<string, string>,
 *   configured?: boolean | null,
   *   onFeedback?: (msg: string, tone?: string) => void,
   *   onSent?: (clientId: string, scenario?: string) => void,
   *   onCampaignDone?: (result: object) => void,
   * }} opts
   */
export function useAdminClubSmsCampaign(opts) {
  const {
    clubId,
    filteredClients,
    memByClient = {},
    smsMode,
    clubName = '',
    templates = null,
    today,
    trainerNameById = {},
    configured = null,
    onFeedback,
    onSent,
    onCampaignDone,
  } = opts

  const [active, setActive] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [composeOpen, setComposeOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [draftText, setDraftText] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  /** @type {[object | null, function]} */
  const [lastResult, setLastResult] = useState(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [resultRecipientsCount, setResultRecipientsCount] = useState(0)
  const abortRef = useRef(null)

  const partition = useMemo(
    () => partitionClubSmsCampaignClients(filteredClients),
    [filteredClients],
  )

  const eligibleIdsKey = useMemo(
    () => partition.eligible.map((r) => r.id).join('|'),
    [partition.eligible],
  )

  useEffect(() => {
    if (!active) return
    setSelectedIds((prev) => {
      const allowed = new Set(partition.eligible.map((r) => r.id))
      const next = new Set()
      for (const id of prev) {
        if (allowed.has(id)) next.add(id)
      }
      return next
    })
  }, [active, eligibleIdsKey, partition.eligible])

  useEffect(() => {
    return () => {
      abortRef.current?.abort?.()
    }
  }, [])

  const recipients = useMemo(
    () => resolveClubSmsCampaignRecipients(selectedIds, partition.eligible),
    [selectedIds, partition.eligible],
  )

  const seedText = useCallback(() => {
    try {
      if (smsMode?.mode === 'template' && smsMode.scenario && recipients[0]) {
        const sample =
          filteredClients.find((c) => String(c.id) === recipients[0].id) || recipients[0]
        const clubTemplates = resolveClubSmsTemplates(templates)
        // Один текст на всех — без имени первого в списке.
        return String(
          buildOutreachMessage(smsMode.scenario, {
            client: { ...(sample && typeof sample === 'object' ? sample : {}), name: '', outreach_name: '' },
            memList: memByClient[recipients[0].id] ?? [],
            trainerName: trainerNameById[String(sample?.trainer_id ?? '')] || '',
            clubName: clubName || 'клуб',
            membershipName: 'абонемент',
            today: today || undefined,
            templates: clubTemplates,
          }) ?? '',
        )
      }
    } catch {
      /* черновик вручную */
    }
    return ''
  }, [
    smsMode,
    recipients,
    filteredClients,
    templates,
    memByClient,
    trainerNameById,
    clubName,
    today,
  ])

  const enter = useCallback(() => {
    if (configured !== true) {
      onFeedback?.('Сначала настройте Мои Звонки в «Max и SMS»', 'warn')
      return
    }
    setActive(true)
    setSelectedIds(selectAllClubSmsCampaignEligible(partition.eligible))
  }, [configured, onFeedback, partition.eligible])

  const exit = useCallback(() => {
    if (running) return
    setActive(false)
    setSelectedIds(new Set())
    setComposeOpen(false)
    setConfirmOpen(false)
    setDraftText('')
    setProgress(null)
  }, [running])

  const selectAll = useCallback(() => {
    setSelectedIds(selectAllClubSmsCampaignEligible(partition.eligible))
  }, [partition.eligible])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const toggle = useCallback((clientId, checked) => {
    setSelectedIds((prev) => toggleClubSmsCampaignSelection(prev, clientId, checked))
  }, [])

  const openCompose = useCallback(() => {
    if (recipients.length === 0) {
      onFeedback?.('Выберите хотя бы одного клиента с телефоном', 'warn')
      return
    }
    setDraftText(seedText())
    setComposeOpen(true)
  }, [recipients.length, onFeedback, seedText])

  const continueToConfirm = useCallback((text) => {
    const normalized = normalizeClubSmsCampaignText(text)
    if (!normalized || recipients.length === 0) return
    setDraftText(normalized)
    setComposeOpen(false)
    setConfirmOpen(true)
  }, [recipients.length])

  const cancelRun = useCallback(() => {
    abortRef.current?.abort?.()
  }, [])

  const launch = useCallback(async () => {
    if (running || !clubId || recipients.length === 0) return
    const text = normalizeClubSmsCampaignText(draftText)
    if (!text) return

    const ac = new AbortController()
    abortRef.current = ac
    setConfirmOpen(false)
    setRunning(true)
    setLastResult(null)
    setResultOpen(false)
    setResultRecipientsCount(recipients.length)
    setProgress({
      index: 0,
      total: recipients.length,
      ok: 0,
      fail: 0,
      status: 'sending',
    })

    try {
      const result = await runClubSmsCampaign({
        clubId,
        recipients,
        text,
        scenario: smsMode?.mode === 'template' ? smsMode.scenario : null,
        signal: ac.signal,
        sendFn: sendClubSmsViaApi,
        logFn: appendClubSmsLog,
        onProgress: (p) => {
          setProgress(p)
          if (p.status === 'ok' && p.current?.id) {
            onSent?.(p.current.id, smsMode?.scenario || 'custom')
          }
        },
      })

      setLastResult(result)
      setResultOpen(true)
      onCampaignDone?.(result)
      setActive(false)
      setSelectedIds(new Set())
      setDraftText('')
    } catch (e) {
      onFeedback?.(e?.message || 'Не удалось выполнить массовую отправку', 'err')
    } finally {
      setRunning(false)
      abortRef.current = null
      setProgress(null)
    }
  }, [
    running,
    clubId,
    recipients,
    draftText,
    smsMode,
    onFeedback,
    onSent,
    onCampaignDone,
  ])

  const progressLabel = useMemo(() => {
    if (!progress) return ''
    const done = Math.min(progress.total, (progress.ok || 0) + (progress.fail || 0))
    const name = progress.current?.name ? ` · ${progress.current.name}` : ''
    if (progress.status === 'waiting_rate') {
      return `${progress.error || 'Пауза лимита'}${name}`
    }
    return `${done} / ${progress.total}${name}`
  }, [progress])

  const isSelected = useCallback(
    (clientId) => selectedIds.has(String(clientId ?? '').trim()),
    [selectedIds],
  )

  const rowSelectable = useCallback((client) => clientHasSendableClubSmsPhone(client), [])

  return {
    active,
    running,
    configured,
    eligibleCount: partition.eligible.length,
    skippedNoPhone: partition.skippedNoPhone.length,
    selectedCount: recipients.length,
    recipients,
    composeOpen,
    confirmOpen,
    draftText,
    progressLabel,
    scenarioLabel: smsMode?.label || '',
    resultOpen,
    lastResult,
    resultRecipientsCount,
    enter,
    exit,
    selectAll,
    clearSelection,
    toggle,
    openCompose,
    continueToConfirm,
    closeCompose: () => setComposeOpen(false),
    closeConfirm: () => !running && setConfirmOpen(false),
    closeResult: () => {
      setResultOpen(false)
      setLastResult(null)
    },
    launch,
    cancelRun,
    isSelected,
    rowSelectable,
  }
}
