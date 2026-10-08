import { useState } from 'react'
import { Repeat, Send } from 'lucide-react'
import { INBOX_LIMITS, normalizeInboxCampaignDraft } from '../../lib/inbox/inboxCampaignCore.js'
import { sendInboxCampaign } from '../../lib/inbox/inboxAdminApiClient.js'
import { INBOX_EXPIRES_CHOICES, INBOX_WHEN_CHOICES, emptyInboxDraft, inboxPushNoteRu } from '../../lib/inbox/inboxAdminUiCore.js'
import { INBOX_TRIGGERS } from '../../lib/inbox/inboxTriggerCore.js'
import { AdminInboxAudience } from './AdminInboxAudience.jsx'
import { AdminInboxQuestions } from './AdminInboxQuestions.jsx'
import { useInboxAudience } from './useAdminInbox.js'

/**
 * Новая рассылка клиентам или команде. Управляющий — только свой клуб (сервер всё равно подставит его).
 * @param {{ kind: 'survey'|'notice', clubs: object[], defaultClubId: string, isSupervisor: boolean, pushBlocker: string|null, onCancel: () => void, onSent: (id: string) => void }} props
 */
export function AdminInboxComposer({ kind, clubs, defaultClubId, isSupervisor, pushBlocker, onCancel, onSent }) {
  const initialClubs = isSupervisor ? clubs.map((c) => c.id) : defaultClubId ? [defaultClubId] : []
  const [draft, setDraft] = useState(() => emptyInboxDraft(kind, initialClubs))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const clubIds = isSupervisor ? clubs.map((c) => c.id) : draft.club_ids
  const reach = useInboxAudience({ audience: draft.audience, clubIds, halls: draft.halls, staffRoles: draft.staff_roles })
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError('')
  }
  const survey = kind === 'survey'
  const staff = draft.audience === 'staff'
  const auto = Boolean(draft.trigger) && survey && !staff
  const payload = { ...draft, club_ids: clubIds, trigger: auto ? draft.trigger : null }

  const submit = async (e) => {
    e.preventDefault()
    const checked = normalizeInboxCampaignDraft(payload)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    const n = reach.audience?.recipients ?? 0
    const whom = n ? ` — получателей: ${n}${staff ? ' (команда)' : ''}` : ''
    const question = auto
      ? `Запустить автоопрос «${checked.campaign.title}»? Он будет приходить клиентам ${INBOX_TRIGGERS[draft.trigger].label}, пока вы его не закроете.`
      : `Отправить «${checked.campaign.title}»${whom}? Отменить отправку будет нельзя.`
    if (!window.confirm(question)) return
    setSending(true)
    try {
      const res = await sendInboxCampaign(payload)
      const note = inboxPushNoteRu(res.push)
      if (note) window.alert(note)
      onSent(res.campaign_id)
    } catch (err) {
      setError(err?.message || 'Не удалось отправить')
      setSending(false)
    }
  }

  return (
    <form className="card admin-inbox__form" onSubmit={submit} noValidate>
      <h2 className="admin-inbox__form-title">{survey ? 'Новый опрос' : 'Новое объявление'}</h2>

      <AdminInboxAudience
        draft={draft}
        set={set}
        clubs={clubs}
        clubIds={clubIds}
        isSupervisor={isSupervisor}
        disabled={sending}
        reach={reach}
        autoTrigger={auto ? draft.trigger : null}
      />

      {survey && !staff ? (
        <div className="field">
          <span className="label">Когда</span>
          <div className="admin-inbox__segment" role="radiogroup" aria-label="Когда отправить">
            {INBOX_WHEN_CHOICES.map(({ trigger, label }) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={draft.trigger === trigger}
                className={`admin-inbox__segment-btn${draft.trigger === trigger ? ' admin-inbox__segment-btn--on' : ''}`}
                onClick={() => set({ trigger })}
                disabled={sending}
              >
                {trigger ? <Repeat size={18} aria-hidden /> : <Send size={18} aria-hidden />}
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <label className="field">
        <span className="label">Заголовок</span>
        <input
          className="input"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          maxLength={INBOX_LIMITS.title}
          placeholder={survey ? 'Например: Как вам тренировки в октябре?' : 'Например: 1 января клуб не работает'}
          disabled={sending}
        />
      </label>
      <label className="field">
        <span className="label">{survey ? 'Вступление (необязательно)' : 'Текст'}</span>
        <textarea
          className="textarea"
          value={draft.body}
          onChange={(e) => set({ body: e.target.value })}
          maxLength={INBOX_LIMITS.body}
          rows={survey ? 2 : 5}
          disabled={sending}
        />
      </label>

      {survey ? (
        <>
          <div className="field">
            <span className="label">Вопросы</span>
            <AdminInboxQuestions questions={draft.questions} onChange={(questions) => set({ questions })} disabled={sending} />
          </div>
          <div className="admin-inbox__row2">
            {staff ? null : (
              <label className="field">
                <span className="label">Баллы за прохождение</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={INBOX_LIMITS.rewardMax}
                  step={10}
                  value={draft.reward_points}
                  onChange={(e) => set({ reward_points: e.target.value })}
                  disabled={sending}
                />
              </label>
            )}
            {auto ? null : (
              <label className="field">
                <span className="label">Принимать ответы</span>
                <select
                  className="select"
                  value={draft.expires_in_days}
                  onChange={(e) => set({ expires_in_days: Number(e.target.value) })}
                  disabled={sending}
                >
                  {INBOX_EXPIRES_CHOICES.map((d) => (
                    <option key={d} value={d}>
                      {d} дн.
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {!staff && Number(draft.reward_points) > 0 ? (
            <p className="muted admin-inbox__hint">Баллы сразу ложатся на счёт ответившего клиента; обменять их можно на стойке.</p>
          ) : null}
        </>
      ) : null}

      {pushBlocker === 'quiet' ? <p className="muted admin-inbox__hint">{inboxPushNoteRu('quiet')}</p> : null}
      {error ? (
        <p className="admin-inbox__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="admin-inbox__actions">
        <button type="button" className="btn btn-ghost btn-touch" onClick={onCancel} disabled={sending}>
          Отмена
        </button>
        <button type="submit" className="btn btn-primary btn-touch" disabled={sending || (!auto && reach.audience?.recipients === 0)}>
          <Send size={18} aria-hidden />
          {sending ? 'Отправляю…' : auto ? 'Запустить' : 'Отправить'}
        </button>
      </div>
    </form>
  )
}
