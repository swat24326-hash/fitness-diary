import { useCallback, useState } from 'react'
import {
  buildOutreachMessage,
  isOutreachScenario,
  outreachMessagePreview,
  runOutreachToMax,
} from '../lib/trainer/trainerClientOutreachCore.js'
import {
  appendOutreachLog,
  hasOutreachLogToday,
} from '../lib/trainer/trainerOutreachLogService.js'
import { pickUsableMembershipForDate } from '../lib/membershipRules.js'
import { todayLocalIso } from '../lib/dateRu.js'

/**
 * @param {{
 *   userId?: string,
 *   trainerName?: string,
 *   clubId?: string | null,
 *   clubName?: string | null,
 *   outreachTemplates?: Record<string, string> | null,
 *   typeNameById?: Record<string, string>,
 *   onFeedback?: (msg: string, tone?: string) => void,
 * }} opts
 */
export function useTrainerOutreach(opts = {}) {
  const [copiedClientId, setCopiedClientId] = useState(null)
  const [busyClientId, setBusyClientId] = useState(null)

  const resolveMembershipName = useCallback(
    (memList, today) => {
      const active = pickUsableMembershipForDate(memList ?? [], today)
      const typeId = active?.membership_type_id
      if (!typeId) return 'абонемент'
      return opts.typeNameById?.[String(typeId)] ?? 'абонемент'
    },
    [opts.typeNameById],
  )

  const handleWriteToMax = useCallback(
    async ({ client, scenario, memList = [], today = todayLocalIso() }) => {
      if (!client?.id || !isOutreachScenario(scenario)) return { ok: false }
      if (!opts.userId) return { ok: false }

      setBusyClientId(client.id)
      try {
        const membershipName = resolveMembershipName(memList, today)
        const result = await runOutreachToMax(scenario, {
          client,
          memList,
          trainerName: opts.trainerName,
          clubName: opts.clubName,
          membershipName,
          today,
          templates: opts.outreachTemplates,
        })

        if (!result.ok) {
          if (result.error === 'no_phone') {
            opts.onFeedback?.('У клиента нет номера телефона', 'warn')
          } else {
            opts.onFeedback?.('Не удалось скопировать текст', 'warn')
          }
          return result
        }

        await appendOutreachLog({
          client_id: client.id,
          trainer_id: opts.userId,
          club_id: opts.clubId ?? null,
          scenario,
          message_preview: outreachMessagePreview(result.message),
        })

        setCopiedClientId(client.id)
        setTimeout(() => setCopiedClientId((cur) => (cur === client.id ? null : cur)), 2000)

        if (!result.opened) {
          opts.onFeedback?.('Скопировано — откройте Max', 'info')
        } else if (result.openMode === 'direct_chat') {
          opts.onFeedback?.('Скопировано — чат Max', 'info')
        } else {
          const phoneHint = result.phone ? ` ${result.phone}` : ''
          opts.onFeedback?.(`Скопировано${phoneHint} — выберите чат`, 'info')
        }
        return result
      } finally {
        setBusyClientId(null)
      }
    },
    [opts, resolveMembershipName],
  )

  const buildPreview = useCallback(
    ({ client, scenario, memList = [], today = todayLocalIso() }) => {
      if (!isOutreachScenario(scenario)) return ''
      return buildOutreachMessage(scenario, {
        client,
        trainerName: opts.trainerName,
        clubName: opts.clubName,
        membershipName: resolveMembershipName(memList, today),
        memList,
        today,
        templates: opts.outreachTemplates,
      })
    },
    [opts.clubName, opts.trainerName, opts.outreachTemplates, resolveMembershipName],
  )

  const wasSentToday = useCallback(
    async (clientId, scenario, today = todayLocalIso()) => {
      if (!opts.userId || !clientId) return false
      return hasOutreachLogToday(clientId, opts.userId, scenario, today)
    },
    [opts.userId],
  )

  return {
    copiedClientId,
    busyClientId,
    handleWriteToMax,
    buildPreview,
    wasSentToday,
  }
}
