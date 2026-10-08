import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gift } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useSurveyPoints } from '../../hooks/useSurveyPoints.js'
import { pointsWord } from '../../lib/client/clientMeUiCore.js'
import { formatDateRu } from '../../lib/dateRu.js'
import { SURVEY_POINTS_COMMENT_MAX } from '../../lib/inbox/inboxPointsCore.js'
import { isAppOnline } from '../../lib/networkReachability.js'

/** Баллы за опросы в карточке клиента: баланс, лента, списание на стойке. Тренеру не показываем. */
export function ClientSurveyPointsSection({ client }) {
  const { isAdmin, isSalesManager, isSupervisor } = useAuth()
  const { account, error, busy, redeem } = useSurveyPoints(client?.id, isAdmin || isSalesManager || isSupervisor)
  const [form, setForm] = useState(null)
  if (!account || account.earned <= 0) return null

  const balance = account.balance
  const amount = Math.trunc(Number(form?.amount))
  const amountOk = Number.isFinite(amount) && amount > 0 && amount <= balance
  const online = isAppOnline()

  async function submit() {
    if (await redeem(amount, form.comment)) setForm(null)
  }

  return (
    <section className="survey-points" aria-label="Баллы за опросы" data-testid="survey-points">
      <div className="survey-points__head">
        <span className="survey-points__icon" aria-hidden>
          <Gift size={20} />
        </span>
        <div className="survey-points__sum">
          <p className="survey-points__eyebrow">Баллы за опросы</p>
          <p className="survey-points__value" aria-live="polite">
            {balance} <span>{pointsWord(balance)}</span>
          </p>
        </div>
        {account.can_redeem && balance > 0 && !form ? (
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={!online}
            title={online ? 'Обменять баллы на подарок' : 'Списание — только при интернете'}
            onClick={() => setForm({ amount: String(balance), comment: '' })}
          >
            Списать
          </button>
        ) : null}
      </div>

      {form ? (
        <div className="survey-points__form" role="group" aria-label="Списание баллов">
          <label>
            Сколько списать
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={balance}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label>
            За что
            <input
              className="input"
              value={form.comment}
              maxLength={SURVEY_POINTS_COMMENT_MAX}
              placeholder="Например: полотенце, смузи"
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
            />
          </label>
          <div className="survey-points__actions">
            <button type="button" className="btn btn-ghost btn-touch" disabled={busy} onClick={() => setForm(null)}>
              Отмена
            </button>
            <button type="button" className="btn btn-primary btn-touch" disabled={busy || !amountOk || !online} onClick={() => void submit()}>
              {busy ? 'Списываю…' : amountOk ? `Списать ${amount} ${pointsWord(amount)}` : 'Списать'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="survey-points__error" role="alert">
          {error}
        </p>
      ) : null}

      {account.history?.length ? (
        <details className="survey-points__history">
          <summary>
            История · начислено {account.earned}, списано {account.redeemed}
          </summary>
          <ul>
            {account.history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <span className={h.delta > 0 ? 'survey-points__plus' : 'survey-points__minus'}>
                  {h.delta > 0 ? `+${h.delta}` : `−${-h.delta}`}
                </span>
                <span className="survey-points__label">{h.label}</span>
                <span className="muted">{formatDateRu(h.at)}</span>
              </li>
            ))}
          </ul>
          {account.can_redeem ? (
            <Link className="survey-points__journal" to={isSalesManager ? '/sales/loyalty' : `/admin/loyalty?club=${encodeURIComponent(String(client?.club_id ?? ''))}`}>
              Журнал списаний клуба
            </Link>
          ) : null}
        </details>
      ) : null}
    </section>
  )
}
