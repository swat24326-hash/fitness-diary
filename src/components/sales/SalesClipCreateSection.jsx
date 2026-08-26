import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus } from 'lucide-react'
import { createSaleClip, cancelSaleClip, fetchSaleClips } from '../../lib/admin/saleClipService.js'
import { buildSaleDayChecklist } from '../../lib/admin/saleClipCore.js'
import { isHoldingTrainerUser } from '../../lib/admin/deskClosingImportCore.js'
import { todayLocalIso, formatDateRu, addDaysToIso, clampIsoDateToToday } from '../../lib/dateRu.js'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { SalesVisualAlert } from './SalesVisualAlert.jsx'
import { normalizeSalesCardNumber } from '../../lib/admin/salesClientMatchCore.js'
import { isPnkTrialTypeRow } from '../../lib/pnk/pnkTrialTrainingCore.js'
import {
  normalizeMembershipTotalTrainings,
  shouldConfirmSuspiciousLowTotal,
  suspiciousLowTotalConfirmMessageRu,
} from '../../lib/membership/membershipTotalGuardCore.js'
import { membershipTypeCode } from '../../lib/membershipTypesService.js'

/**
 * Форма клип-карты + список дня + мягкий чеклист.
 * @param {{
 *   clubId: string,
 *   trainers?: object[],
 *   membershipTypes?: object[],
 *   reportDate?: string,
 *   onReportDateChange?: (iso: string) => void,
 *   canOpenAdminClient?: boolean,
 * }} props
 */
export function SalesClipCreateSection({
  clubId,
  trainers = [],
  membershipTypes = [],
  reportDate,
  onReportDateChange,
  canOpenAdminClient = false,
}) {
  const day = String(reportDate || todayLocalIso()).slice(0, 10)
  const [clips, setClips] = useState([])
  const [overdueAwaiting, setOverdueAwaiting] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [warnings, setWarnings] = useState([])
  const [form, setForm] = useState({
    card_number: '',
    phone: '',
    client_name: '',
    trainer_id: '',
    membership_type_id: '',
    membership_type_label: '',
    total_trainings: '8',
    start_date: day,
    end_date: '',
    note: '',
  })

  const realTrainers = useMemo(
    () => (trainers ?? []).filter((t) => !isHoldingTrainerUser(t)),
    [trainers],
  )

  const trainerNameById = useMemo(() => {
    const m = new Map()
    for (const t of trainers ?? []) {
      if (t?.id) m.set(String(t.id), String(t.name ?? '').trim() || String(t.id))
    }
    return m
  }, [trainers])

  const reload = async () => {
    if (!clubId) return
    try {
      const [dayData, awaitingData] = await Promise.all([
        fetchSaleClips({ clubId, clipDate: day }),
        fetchSaleClips({ clubId, status: 'awaiting' }),
      ])
      setClips(dayData.clips ?? [])
      const overdue = (awaitingData.clips ?? []).filter(
        (c) => String(c?.clip_date ?? '').slice(0, 10) !== day,
      ).length
      setOverdueAwaiting(overdue)
    } catch (e) {
      setError(e?.message || 'Не удалось загрузить клипы')
    }
  }

  useEffect(() => {
    void reload()
  }, [clubId, day])

  useEffect(() => {
    setForm((f) => ({ ...f, start_date: day }))
  }, [day])

  const checklist = useMemo(
    () => buildSaleDayChecklist({ clips, asOf: day, overdueAwaiting }),
    [clips, day, overdueAwaiting],
  )

  /** Живые подсказки: программа сразу пишет, чего не хватает (без звука). */
  const formHints = useMemo(() => {
    const hints = []
    const card = normalizeSalesCardNumber(form.card_number)
    const phone = String(form.phone ?? '').trim()
    const name = String(form.client_name ?? '').trim()
    if (!name) hints.push('Нет ФИО — программа не поймет, кого заводить')
    if (!card && !phone) hints.push('Нет карты и телефона — так искать человека нельзя')
    else if (!card) hints.push('Нет номера карты — поиск слабый, лучше дописать карту')
    if (!form.trainer_id) hints.push('Не выбран тренер — клип некуда отправить')
    if (!realTrainers.length) hints.push('В клубе нет тренеров в списке — обновите страницу или проверьте организацию')
    return hints
  }, [form, realTrainers.length])

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const onTypeChange = (typeId) => {
    const t = membershipTypes.find((x) => String(x.id) === String(typeId))
    setForm((f) => ({
      ...f,
      membership_type_id: typeId,
      membership_type_label: t ? String(t.code ?? t.name ?? '') : f.membership_type_label,
    }))
  }

  const shiftDay = (delta) => {
    const next = clampIsoDateToToday(addDaysToIso(day, delta))
    onReportDateChange?.(next)
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!clubId) {
      setError('Программа не поняла клуб. Выберите клуб или войдите снова.')
      return
    }
    if (formHints.length) {
      setError(`Программа не поняла форму: ${formHints[0]}`)
      setOkMsg('')
      return
    }
    const totalTrainings = normalizeMembershipTotalTrainings(form.total_trainings)
    const typeRow = membershipTypes.find((t) => String(t.id) === String(form.membership_type_id || ''))
    if (
      shouldConfirmSuspiciousLowTotal({
        totalTrainings,
        isPnkTrialType: isPnkTrialTypeRow(typeRow),
      })
    ) {
      const ok = window.confirm(
        suspiciousLowTotalConfirmMessageRu({
          typeCode:
            membershipTypeCode(membershipTypes, form.membership_type_id) ||
            String(form.membership_type_label || '').trim(),
          totalTrainings,
        }),
      )
      if (!ok) return
    }
    setBusy(true)
    setError('')
    setOkMsg('')
    setWarnings([])
    try {
      const data = await createSaleClip({
        club_id: clubId,
        clip_date: day,
        client_name: formatClientName(form.client_name),
        phone: form.phone,
        card_number: form.card_number,
        trainer_id: form.trainer_id,
        membership_type_id: form.membership_type_id || null,
        membership_type_label: form.membership_type_label || null,
        total_trainings: totalTrainings,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        note: form.note || null,
      })
      setWarnings(data.warnings ?? [])
      setOkMsg(data.reason || 'Поняла. Клип создан — ждём планшет тренера.')
      setForm((f) => ({
        ...f,
        client_name: '',
        phone: '',
        card_number: '',
        note: '',
      }))
      await reload()
    } catch (err) {
      setError(
        err?.message
          ? `Программа не сохранила клип: ${err.message}`
          : 'Программа не сохранила клип. Проверьте интернет и повторите.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onCancel = async (id) => {
    if (!window.confirm('Отменить клип? Абонемент на планшете ещё не создан.')) return
    setBusy(true)
    setError('')
    setOkMsg('')
    try {
      await cancelSaleClip({ clubId, id })
      setOkMsg('Клип отменён')
      await reload()
    } catch (err) {
      setError(err?.message || 'Не удалось отменить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="sales-clip-section card" aria-label="Заявки тренеру на абонемент">
      <div className="sales-clip-section__head">
        <h2 className="sales-report__section-title">
          <ClipboardList size={20} aria-hidden /> Заявка тренеру на абон
        </h2>
        {onReportDateChange ? (
          <div className="sales-clip-section__day" role="group" aria-label="Дата заявок">
            <button type="button" className="btn btn-xs" onClick={() => shiftDay(-1)} aria-label="Вчера">
              ←
            </button>
            <input
              type="date"
              value={day}
              max={todayLocalIso()}
              onChange={(e) => onReportDateChange(clampIsoDateToToday(e.target.value))}
            />
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => shiftDay(1)}
              aria-label="Завтра"
              disabled={day >= todayLocalIso()}
            >
              →
            </button>
            <span className="muted">{formatDateRu(day)}</span>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {formatDateRu(day)}
          </p>
        )}
      </div>
      <p className="muted sales-clip-section__tip">
        После продажи в 1С / amo — отправьте тренеру заявку на создание абона (30 сек). Правда = кнопка на планшете
        «Создать по заявке». Сначала карта, потом телефон. Жёлтое/красное предупреждение — без звука.
      </p>

      {!checklist.closedSoft ? (
        <SalesVisualAlert level="warn" title="Есть заявки без абона на планшете">
          <ul>
            {checklist.items.map((it) => (
              <li key={it.key}>{it.text}</li>
            ))}
          </ul>
        </SalesVisualAlert>
      ) : (
        <SalesVisualAlert level="ok" title={`На ${formatDateRu(day)} висящих заявок нет`} />
      )}

      {formHints.length ? (
        <SalesVisualAlert level="warn" title="Программа пока не поняла форму">
          <ul>
            {formHints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </SalesVisualAlert>
      ) : null}

      <form className="sales-clip-form" onSubmit={(e) => void submit(e)}>
        <label>
          № карты
          <input
            value={form.card_number}
            onChange={(e) => setField('card_number', e.target.value)}
            placeholder="Как на клип-карте"
            autoComplete="off"
          />
        </label>
        <label>
          Телефон
          <input
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
            placeholder="Если карты нет"
            inputMode="tel"
          />
        </label>
        <label>
          ФИО
          <input
            value={form.client_name}
            onChange={(e) => setField('client_name', e.target.value)}
            required
            placeholder="Фамилия Имя"
            autoComplete="name"
          />
        </label>
        <label>
          Тренер (планшет)
          <select
            value={form.trainer_id}
            onChange={(e) => setField('trainer_id', e.target.value)}
            required
          >
            <option value="">Выберите…</option>
            {realTrainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || t.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Тип абона
          <select value={form.membership_type_id} onChange={(e) => onTypeChange(e.target.value)}>
            <option value="">—</option>
            {(membershipTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.code || t.name || t.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Тренировок
          <input
            type="number"
            min={0}
            value={form.total_trainings}
            onChange={(e) => setField('total_trainings', e.target.value)}
          />
        </label>
        <label>
          Начало
          <input type="date" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
        </label>
        <label>
          Окончание
          <input type="date" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} />
        </label>
        <label className="sales-clip-form__note">
          Заметка
          <input value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="Необязательно" />
        </label>
        {error ? (
          <SalesVisualAlert level="error" title="Программа не поняла / не сохранила">
            <p>{error}</p>
          </SalesVisualAlert>
        ) : null}
        {okMsg ? (
          <SalesVisualAlert level="ok" title="Готово">
            <p>{okMsg}</p>
          </SalesVisualAlert>
        ) : null}
        {warnings.length ? (
          <SalesVisualAlert level="warn" title="Заявка создана, но есть предупреждения">
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </SalesVisualAlert>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy || !clubId}>
          <Plus size={16} aria-hidden /> Отправить заявку → планшет
        </button>
      </form>

      <h3 className="sales-report__section-title">Заявки на {formatDateRu(day)}</h3>
      {!clips.length ? (
        <p className="muted">Пока пусто — создайте после продажи (НК, ДК или УК).</p>
      ) : (
        <ul className="sales-clip-list">
          {clips.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.client_name}</strong>
                {c.card_number ? ` · карта ${c.card_number}` : ''}
                {c.phone ? ` · ${c.phone}` : ''}
                <div className="muted">
                  {c.status === 'awaiting'
                    ? 'Ждём планшет'
                    : c.status === 'done'
                      ? 'Подтверждено планшетом'
                      : 'Отменён'}
                  {c.trainer_id ? ` · ${trainerNameById.get(String(c.trainer_id)) || 'тренер'}` : ''}
                  {canOpenAdminClient && c.client_id ? (
                    <>
                      {' · '}
                      <Link
                        to={`/admin/clients/${c.client_id}?club=${encodeURIComponent(clubId)}&from=clips`}
                      >
                        карточка
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
              {c.status === 'awaiting' ? (
                <button type="button" className="btn btn-xs" disabled={busy} onClick={() => void onCancel(c.id)}>
                  Отменить
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
