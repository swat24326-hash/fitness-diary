import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Eraser, Plus } from 'lucide-react'
import { createSaleClip, cancelSaleClip, fetchSaleClips, fulfillSaleClip } from '../../lib/admin/saleClipService.js'
import { buildSaleDayChecklist } from '../../lib/admin/saleClipCore.js'
import { planFulfillAwaitingSaleClip } from '../../lib/admin/saleClipInstantCore.js'
import { SalesClipDayList } from './SalesClipDayList.jsx'
import { buildSaleClipFormPatchFromPaste } from '../../lib/admin/saleClipPasteCore.js'
import { isHoldingTrainerUser } from '../../lib/admin/deskClosingImportCore.js'
import { todayLocalIso, formatDateRu, addDaysToIso, clampIsoDateToToday } from '../../lib/dateRu.js'
import { formatClientName } from '../../lib/clientNameFormat.js'
import { SaleClipMatchPreview, saleClipTransferConfirmMessage } from './SaleClipMatchPreview.jsx'
import { useSaleClipMatchPreview } from './useSaleClipMatchPreview.js'
import { SalesVisualAlert } from './SalesVisualAlert.jsx'
import { normalizeSalesCardNumber } from '../../lib/admin/salesClientMatchCore.js'
import { isPnkTrialTypeRow } from '../../lib/pnk/pnkTrialTrainingCore.js'
import {
  normalizeMembershipTotalTrainings,
  shouldConfirmSuspiciousLowTotal,
  suspiciousLowTotalConfirmMessageRu,
} from '../../lib/membership/membershipTotalGuardCore.js'
import { membershipTypeCode } from '../../lib/membershipTypesService.js'

/** Поля клиента под следующий клип; день и тренер не трогаем снаружи. */
function emptyClipClientFields(startDate) {
  return {
    card_number: '',
    phone: '',
    client_name: '',
    membership_type_id: '',
    membership_type_label: '',
    total_trainings: '',
    start_date: startDate,
    end_date: '',
    note: '',
  }
}

/**
 * Форма клип-карты + список дня + мягкий чеклист.
 * Можно заполнить полями или вставить сплошной текст с клип-карты (как массовое добавление упражнений).
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
  const [pasteText, setPasteText] = useState('')
  const [pasteInfo, setPasteInfo] = useState('')
  const [pasteWarnings, setPasteWarnings] = useState([])
  const [resumeClipId, setResumeClipId] = useState('')
  const [form, setForm] = useState({
    trainer_id: '',
    ...emptyClipClientFields(day),
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

  const formHasClientData = Boolean(
    pasteText.trim() ||
      form.client_name.trim() ||
      form.card_number.trim() ||
      form.phone.trim() ||
      form.note.trim() ||
      form.end_date ||
      form.membership_type_id ||
      okMsg ||
      error,
  )

  /** Очистить форму под следующий клип: день и выбранный тренер остаются. */
  const clearForNextClip = () => {
    setPasteText('')
    setPasteInfo('')
    setPasteWarnings([])
    setError('')
    setOkMsg('')
    setWarnings([])
    setResumeClipId('')
    setForm((f) => ({
      trainer_id: f.trainer_id,
      ...emptyClipClientFields(day),
    }))
  }

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

  useEffect(() => {
    const raw = pasteText.trim()
    if (!raw) {
      setPasteInfo('')
      setPasteWarnings([])
      return
    }
    const built = buildSaleClipFormPatchFromPaste(raw, {
      trainers: realTrainers,
      membershipTypes,
    })
    setPasteInfo(built.reason)
    setPasteWarnings(built.warnings)
    if (Object.keys(built.patch).length) {
      setForm((f) => ({ ...f, ...built.patch }))
    }
    // Только при смене текста: иначе повторная подстановка затирает ручные правки полей.
  }, [pasteText])

  const checklist = useMemo(
    () => buildSaleDayChecklist({ clips, asOf: day, overdueAwaiting }),
    [clips, day, overdueAwaiting],
  )

  const matchPreview = useSaleClipMatchPreview({
    clubId,
    cardNumber: form.card_number,
    phone: form.phone,
    clipName: form.client_name,
    selectedTrainerId: form.trainer_id,
    trainerNameById,
  })

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
    if (!form.membership_type_id) hints.push('Нет типа абонемента')
    if (!form.end_date) hints.push('Нет даты окончания')
    const rawTotal = String(form.total_trainings ?? '').trim()
    if (!rawTotal) hints.push('Нет числа занятий')
    else if (!(Number(rawTotal) > 0)) hints.push('Число занятий должно быть больше 0')
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
    let confirmTransfer = matchPreview?.needTransferConfirm === true
    if (confirmTransfer) {
      const agreed = window.confirm(saleClipTransferConfirmMessage(matchPreview))
      if (!agreed) return
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
      const noteParts = []
      if (String(form.note ?? '').trim()) noteParts.push(String(form.note).trim())
      if (pasteText.trim()) noteParts.push(`Текст клипа:\n${pasteText.trim()}`)
      const payload = {
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
        note: noteParts.length ? noteParts.join('\n\n') : null,
        confirm_transfer: confirmTransfer,
      }
      let data
      try {
        data = resumeClipId
          ? await fulfillSaleClip({
              clubId,
              id: resumeClipId,
              membershipTypeId: form.membership_type_id,
              totalTrainings,
              startDate: form.start_date || null,
              endDate: form.end_date || null,
            })
          : await createSaleClip(payload)
      } catch (err) {
        const msg = String(err?.message || '')
        if (!resumeClipId && !confirmTransfer && /перевод|другой тренер/i.test(msg)) {
          const agreed = window.confirm(saleClipTransferConfirmMessage(matchPreview))
          if (!agreed) throw err
          data = await createSaleClip({ ...payload, confirm_transfer: true })
        } else {
          throw err
        }
      }
      setWarnings(data.warnings ?? [])
      setOkMsg(data.reason || 'Абонемент создан')
      setPasteText('')
      setPasteInfo('')
      setPasteWarnings([])
      setResumeClipId('')
      setForm((f) => ({
        trainer_id: f.trainer_id,
        ...emptyClipClientFields(day),
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

  const fillAwaitingClip = (clip, hint) => {
    setResumeClipId(String(clip.id))
    setPasteText('')
    setPasteInfo('')
    setPasteWarnings([])
    setError('')
    setWarnings([])
    setOkMsg('')
    setError(
      hint ||
        'Планшет эту заявку не закрывает. Допишите тип, дату окончания и число занятий — «Создать абонемент» закроет эту строку.',
    )
    setForm({
      trainer_id: String(clip.trainer_id ?? ''),
      card_number: String(clip.card_number ?? ''),
      phone: String(clip.phone ?? ''),
      client_name: String(clip.client_name ?? ''),
      membership_type_id: String(clip.membership_type_id ?? ''),
      membership_type_label: String(clip.membership_type_label ?? ''),
      total_trainings: clip.total_trainings ?? '',
      start_date: String(clip.start_date || clip.clip_date || day).slice(0, 10),
      end_date: clip.end_date ? String(clip.end_date).slice(0, 10) : '',
      note: String(clip.note ?? ''),
    })
  }

  const onCreateFromAwaiting = async (clip) => {
    const planned = planFulfillAwaitingSaleClip(clip)
    if (!planned.ok) {
      if (planned.needsFields) {
        fillAwaitingClip(clip, planned.reason)
        return
      }
      setError(planned.reason || 'Не удалось создать абонемент')
      return
    }
    setBusy(true)
    setError('')
    setOkMsg('')
    setWarnings([])
    try {
      const data = await fulfillSaleClip({ clubId, id: clip.id })
      setWarnings(data.warnings ?? [])
      setOkMsg(data.reason || 'Абонемент создан')
      setResumeClipId('')
      await reload()
    } catch (err) {
      if (err?.needsFields) {
        fillAwaitingClip(clip, err.message)
        return
      }
      setError(err?.message || 'Не удалось создать абонемент')
    } finally {
      setBusy(false)
    }
  }

  const onCancel = async (id) => {
    if (!window.confirm('Снять заявку? Абонемент по ней не создан.')) return
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
    <section className="sales-clip-section" aria-label="Заявки тренеру на абонемент">
      <div className="sales-clip-section__head">
        <h2 className="sales-clip-section__title">
          <span className="sales-clip-section__title-icon" aria-hidden>
            <ClipboardList size={20} />
          </span>
          Заявка тренеру на абон
        </h2>
        {onReportDateChange ? (
          <div className="sales-clip-section__day" role="group" aria-label="Дата заявок">
            <button type="button" className="btn btn-ghost btn-icon-square sales-clip-section__day-nav" onClick={() => shiftDay(-1)} aria-label="Вчера">
              ←
            </button>
            <input
              type="date"
              className="sales-clip-section__day-input"
              value={day}
              max={todayLocalIso()}
              onChange={(e) => onReportDateChange(clampIsoDateToToday(e.target.value))}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon-square sales-clip-section__day-nav"
              onClick={() => shiftDay(1)}
              aria-label="Завтра"
              disabled={day >= todayLocalIso()}
            >
              →
            </button>
            <span className="sales-clip-section__day-label">{formatDateRu(day)}</span>
          </div>
        ) : (
          <p className="sales-clip-section__day-label">{formatDateRu(day)}</p>
        )}
      </div>
      <p className="sales-clip-section__tip">
        После продажи в 1С — вставьте текст клип-карты ниже или заполните поля. Абонемент создаётся сразу, на планшете
        тренер нажимает «Синхронизировать».
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
        <label className="sales-clip-form__paste">
          Текст с клип-карты
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder="Вставьте сюда текст из 1С / переписки — поля заполнятся сами"
            spellCheck={false}
          />
        </label>
        {pasteInfo ? (
          <SalesVisualAlert level="ok" title="Распознала текст">
            <p>{pasteInfo}</p>
            {pasteWarnings.length ? (
              <ul>
                {pasteWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </SalesVisualAlert>
        ) : null}
        <div className="sales-clip-form__fields">
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
          <label className="sales-clip-form__field--wide">
            ФИО
            <input
              value={form.client_name}
              onChange={(e) => setField('client_name', e.target.value)}
              required
              placeholder="Фамилия Имя"
              autoComplete="name"
            />
          </label>
          <label className="sales-clip-form__field--wide">
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
              min={1}
              value={form.total_trainings}
              onChange={(e) => setField('total_trainings', e.target.value)}
              placeholder="Сколько занятий"
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
        </div>
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
            <p className="sales-clip-form__next-hint muted">
              Дата заявок не менялась. Можно сразу следующий клип — тренер уже выбран.
            </p>
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
        <SaleClipMatchPreview preview={matchPreview} />
        <div className="sales-clip-form__actions">
          <button type="submit" className="btn btn-primary sales-clip-form__submit" disabled={busy || !clubId}>
            <Plus size={18} aria-hidden /> Создать абонемент
          </button>
          <button
            type="button"
            className={`btn ${okMsg ? 'btn-secondary' : 'btn-ghost'} sales-clip-form__clear`}
            disabled={busy || !formHasClientData}
            onClick={clearForNextClip}
            title="Очистить поля клиента. Дата дня и тренер останутся"
          >
            <Eraser size={18} aria-hidden /> {okMsg ? 'Ещё один клип' : 'Очистить'}
          </button>
        </div>
      </form>

      <SalesClipDayList
        clips={clips}
        day={day}
        trainerNameById={trainerNameById}
        clubId={clubId}
        canOpenAdminClient={canOpenAdminClient}
        busy={busy}
        onCancel={(id) => void onCancel(id)}
        onCreate={(clip) => void onCreateFromAwaiting(clip)}
      />
    </section>
  )
}
