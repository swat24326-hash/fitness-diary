import { useCallback, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { pickUsableMembershipForDate } from '../../lib/membershipRules.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { runClubDeskMaxOutreach } from '../../lib/admin/clubClientMaxOutreachCore.js'

/**
 * Кнопка Max рядом с SMS на доске клиентов (админ / менеджер / управляющий).
 * Копирует текст «от клуба» и открывает чат Max.
 * @param {{
 *   client: { id: string, name?: string, phone?: string | null, outreach_name?: string | null, max_chat_url?: string | null, trainer_id?: string | null },
 *   mode?: 'template' | 'custom',
 *   scenario?: string | null,
 *   scenarioLabel?: string,
 *   memList?: object[],
 *   trainerName?: string,
 *   clubName?: string,
 *   membershipName?: string,
 *   today?: string,
 *   templates?: Record<string, string> | null,
 *   busy?: boolean,
 *   onFeedback?: (msg: string, tone?: string) => void,
 * }} props
 */
export function AdminClientMaxButton({
  client,
  mode = 'custom',
  scenario = null,
  scenarioLabel = '',
  memList = [],
  trainerName = '',
  clubName = '',
  membershipName,
  today,
  templates = null,
  busy = false,
  onFeedback,
}) {
  const [sending, setSending] = useState(false)
  const hasContact = Boolean(
    String(client?.phone ?? '').trim() || String(client?.max_chat_url ?? '').trim(),
  )

  const onClick = useCallback(async () => {
    if (!client?.id || busy || sending) return
    if (!hasContact) {
      onFeedback?.('Нужен телефон или ссылка на чат Max в карточке', 'warn')
      return
    }
    setSending(true)
    try {
      const day = today || todayLocalIso()
      const memName =
        membershipName ||
        (() => {
          const active = pickUsableMembershipForDate(memList ?? [], day)
          return active ? 'абонемент' : 'абонемент'
        })()
      const result = await runClubDeskMaxOutreach({
        client,
        mode,
        scenario,
        memList,
        trainerName,
        clubName,
        membershipName: memName,
        today: day,
        templates,
      })
      if (!result.ok) {
        if (result.error === 'no_contact') {
          onFeedback?.('Нужен телефон или ссылка на чат Max', 'warn')
        } else if (result.error === 'copy_failed') {
          onFeedback?.('Не удалось скопировать текст', 'warn')
        } else {
          onFeedback?.('Не удалось открыть Max', 'warn')
        }
        return
      }
      if (!result.opened) {
        onFeedback?.(result.copied ? 'Скопировано — откройте Max' : 'Откройте Max вручную', 'info')
      } else if (result.openMode === 'direct_chat') {
        onFeedback?.(result.copied ? 'Текст скопирован · чат Max' : 'Открыт чат Max', 'ok')
      } else {
        onFeedback?.(result.copied ? 'Текст скопирован · Max' : 'Открыт Max', 'ok')
      }
    } finally {
      setSending(false)
    }
  }, [
    busy,
    client,
    clubName,
    hasContact,
    memList,
    membershipName,
    mode,
    onFeedback,
    scenario,
    sending,
    templates,
    today,
    trainerName,
  ])

  const title = !hasContact
    ? 'Нет телефона и ссылки Max'
    : mode === 'template'
      ? `Max · ${scenarioLabel || 'шаблон клуба'}`
      : 'Написать в Max'

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon-square btn-touch"
      disabled={busy || sending || !hasContact}
      onClick={() => void onClick()}
      aria-label={title}
      title={title}
    >
      <MessageCircle size={20} aria-hidden />
    </button>
  )
}
