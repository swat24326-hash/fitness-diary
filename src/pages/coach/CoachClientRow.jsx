import { Phone } from 'lucide-react'
import { formatLastTrainingDate, membershipSignal, membershipSignalDotClass } from '../../lib/clientListSignals.js'
import { coachBirthdayLabel, coachMembershipFact, coachTelHref } from '../../lib/coach/coachClientsListCore.js'
import '../../styles/pnk-funnel.css'

/** Строка «Клиенты» на телефоне: точка абонемента, имя, абонемент, карта · последняя · ДР; справа «Позвонить». */
export function CoachClientRow({ client, memList, today, filter, onOpen }) {
  const sig = membershipSignal(memList, today)
  const tel = coachTelHref(client.phone)
  const bday = coachBirthdayLabel(client.birth_date, today, filter)
  const meta = [
    client.card_number ? `Карта ${client.card_number}` : '',
    client.last_training_date ? `Был ${formatLastTrainingDate(client.last_training_date)}` : 'Тренировок не было',
  ].filter(Boolean)

  return (
    <li className="coach-client">
      <button type="button" className="coach-client__main" onClick={onOpen} aria-label={`${client.name}: абонементы`}>
        <span className={`td-client-dot td-client-dot--${membershipSignalDotClass(sig.key)}`} title={sig.label} aria-hidden />
        <span className="coach-client__text">
          <span className="coach-client__name">
            {client.name}
            {client.lifecycle === 'pnk' ? <span className="pnk-badge">ПНК</span> : null}
          </span>
          <span className="coach-client__mem">{coachMembershipFact(memList, today)}</span>
          <span className="coach-client__meta muted">{meta.join(' · ')}</span>
          {bday ? <span className="coach-client__bday">ДР {bday}</span> : null}
        </span>
      </button>
      {tel ? (
        <a className="btn btn-secondary btn-icon-square coach-client__call" href={tel} aria-label={`Позвонить: ${client.name}`}>
          <Phone size={18} aria-hidden />
        </a>
      ) : null}
    </li>
  )
}
