import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { listClientsByClubId, listMembershipsByClubId } from '../../lib/localDbClubQuery.js'
import { dispatchLocalDataChanged } from '../../lib/dataAccess.js'
import { planDeskClosingImport, scopeClosingRowsToHall } from '../../lib/admin/deskClosingImportCore.js'
import { parseDeskClosingXlsxFile } from '../../lib/admin/deskClosingImportWorkbook.js'
import { applyDeskClosingCreates } from '../../lib/admin/deskClosingApplyService.js'

const HALL_LABEL = { tz: 'ТЗ', az: 'АЗ' }

/**
 * Сид закрывающихся договоров → desk-карточки без тренера (только admin).
 * @param {{
 *   clubId: string,
 *   onDone?: () => void,
 *   defaultHall?: 'tz'|'az'|null,
 *   title?: string,
 *   hint?: string,
 *   fileButtonLabel?: string,
 *   children?: import('react').ReactNode,
 * }} props
 */
export function AdminDeskClosingImportSection({
  clubId,
  onDone,
  defaultHall = null,
  title,
  hint,
  fileButtonLabel,
  children,
}) {
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState(null)
  const [parseReasons, setParseReasons] = useState([])
  const [error, setError] = useState('')
  const [resultMsg, setResultMsg] = useState('')

  const handleFile = async (file) => {
    if (!file || !clubId) return
    setBusy(true)
    setError('')
    setResultMsg('')
    setFileName(file.name || '')
    try {
      const parsed = await parseDeskClosingXlsxFile(file)
      setParseReasons(parsed.reasons ?? [])
      if (!parsed.rows.length) {
        setPlan(null)
        setError(parsed.reasons?.[0] || 'Нет строк для импорта')
        return
      }
      const scoped = scopeClosingRowsToHall(parsed.rows, defaultHall)
      if (!scoped.length) {
        setPlan(null)
        setError(
          defaultHall
            ? `В файле нет строк для зала ${HALL_LABEL[defaultHall] || defaultHall}`
            : 'Нет строк для импорта',
        )
        return
      }
      const [clients, memberships] = await Promise.all([
        listClientsByClubId(clubId),
        listMembershipsByClubId(clubId),
      ])
      /** @type {Record<string, object[]>} */
      const membershipsByClientId = {}
      for (const m of memberships ?? []) {
        const cid = String(m?.client_id ?? '')
        if (!cid) continue
        if (!membershipsByClientId[cid]) membershipsByClientId[cid] = []
        membershipsByClientId[cid].push(m)
      }
      setPlan(planDeskClosingImport({ parsedRows: scoped, clients, membershipsByClientId }))
    } catch (e) {
      setError(e?.message || 'Не удалось прочитать файл')
      setPlan(null)
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async () => {
    const createN = Number(plan?.counts?.create) || 0
    const tagN = Number(plan?.counts?.tagHall) || 0
    if (!createN && !tagN) return
    setBusy(true)
    setError('')
    try {
      const res = await applyDeskClosingCreates({
        actions: plan.actions,
        clubId,
        defaultHall: defaultHall === 'tz' || defaultHall === 'az' ? defaultHall : null,
      })
      if (!res.ok && !res.created && !res.tagged) {
        setError(res.error || res.errors?.join('; ') || 'Не применено')
      } else {
        const parts = []
        if (res.created) parts.push(`создано ${res.created}`)
        if (res.tagged) parts.push(`зал проставлен ${res.tagged}`)
        setResultMsg(
          parts.join(', ') +
            (res.errors?.length ? `. Ошибки: ${res.errors.slice(0, 3).join('; ')}` : ''),
        )
        dispatchLocalDataChanged?.()
        onDone?.()
      }
    } catch (e) {
      setError(e?.message || 'Ошибка записи')
    } finally {
      setBusy(false)
    }
  }

  const hallTitle =
    title ||
    (defaultHall === 'tz'
      ? 'Список заканчивающихся — только ТЗ'
      : defaultHall === 'az'
        ? 'Список заканчивающихся — только АЗ'
        : 'Список заканчивающихся (ТЗ и АЗ)')
  const hallHint =
    hint ||
    (defaultHall
      ? `Файл только для ${HALL_LABEL[defaultHall]}. Нужны: номер карты, ФИО, дата окончания (цена — по желанию).`
      : null)
  const pickLabel = fileButtonLabel || 'Загрузить выгрузку из 1С'

  return (
    <section
      className="admin-desk-closing"
      aria-label={hallTitle}
      data-hall={defaultHall || 'mixed'}
    >
      {title ? <h3 className="admin-section-title">{hallTitle}</h3> : null}
      {children ||
        (hallHint ? (
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            {hallHint}
          </p>
        ) : null)}
      <p className="muted admin-excel-map-card__ready">
        Новые карточки без тренера — только вкладки ТЗ / АЗ в «Клиентах».
      </p>
      <label className="sales-payments-import__file">
        <FileSpreadsheet size={18} aria-hidden />
        <span>{busy ? 'Читаю файл…' : fileName || pickLabel}</span>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy || !clubId}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            void handleFile(f)
          }}
        />
      </label>
      {error ? <p className="sales-report__error">{error}</p> : null}
      {resultMsg ? <p className="muted">{resultMsg}</p> : null}
      {parseReasons?.length ? (
        <ul className="muted">
          {parseReasons.slice(0, 5).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      {plan ? (
        <>
          <p>
            В файле: ТЗ {plan.counts.hallTz ?? 0}, АЗ {plan.counts.hallAz ?? 0}
            {Number(plan.counts.hallUnknown) > 0
              ? `, без зала ${plan.counts.hallUnknown}`
              : ''}
            . Итого: создать {plan.counts.create}, зал {plan.counts.tagHall ?? 0}, пропуск{' '}
            {plan.counts.skip}, конфликт {plan.counts.conflict}
          </p>
          <div className="sales-payments-import__table-wrap">
            <table className="sales-payments-import__table">
              <thead>
                <tr>
                  <th>Что сделаем</th>
                  <th>Зал</th>
                  <th>Карта</th>
                  <th>ФИО</th>
                  <th>Конец</th>
                  <th>Цена</th>
                  <th>Почему</th>
                </tr>
              </thead>
              <tbody>
                {plan.actions.slice(0, 80).map((a) => (
                  <tr key={`${a.cardNumber}-${a.action}-${a.endDate}`}>
                    <td>
                      {a.action === 'create'
                        ? 'создать'
                        : a.action === 'tag_hall'
                          ? 'зал'
                          : a.action === 'skip'
                            ? 'пропуск'
                            : a.action === 'conflict'
                              ? 'конфликт'
                              : a.action}
                    </td>
                    <td>{a.hall === 'tz' || a.hall === 'az' ? HALL_LABEL[a.hall] : '—'}</td>
                    <td>{a.cardNumber}</td>
                    <td>{a.name}</td>
                    <td>{a.endDate || '—'}</td>
                    <td>{a.paidAmount != null ? a.paidAmount : '—'}</td>
                    <td className="sales-payments-import__reason">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              busy || (!(Number(plan.counts.create) > 0) && !(Number(plan.counts.tagHall) > 0))
            }
            onClick={() => void handleApply()}
          >
            Применить
            {Number(plan.counts.create) > 0 ? ` · создать ${plan.counts.create}` : ''}
            {Number(plan.counts.tagHall) > 0 ? ` · зал ${plan.counts.tagHall}` : ''}
          </button>
        </>
      ) : null}
    </section>
  )
}
