import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { listClientsByClubId, listMembershipsByClubId } from '../lib/localDbClubQuery.js'
import { listTrainerSummariesForAdmin, dispatchLocalDataChanged } from '../lib/dataAccess.js'
import {
  HOLDING_TRAINER_DISPLAY_NAME,
  isHoldingTrainerUser,
  planDeskClosingImport,
} from '../lib/admin/deskClosingImportCore.js'
import { parseDeskClosingXlsxFile } from '../lib/admin/deskClosingImportWorkbook.js'
import { applyDeskClosingCreates } from '../lib/admin/deskClosingApplyService.js'

/**
 * Сид закрывающихся договоров → desk-карточки (только admin).
 * @param {{
 *   clubId: string,
 *   onDone?: () => void,
 * }} props
 */
export function AdminDeskClosingImportSection({ clubId, onDone }) {
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState(null)
  const [parseReasons, setParseReasons] = useState([])
  const [error, setError] = useState('')
  const [resultMsg, setResultMsg] = useState('')
  const [trainers, setTrainers] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listTrainerSummariesForAdmin()
        if (!cancelled) setTrainers(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setTrainers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clubId])

  const holdingTrainers = useMemo(
    () =>
      (trainers ?? []).filter((t) => {
        if (!isHoldingTrainerUser(t)) return false
        const tidClub = String(t.club_id ?? '')
        return !tidClub || tidClub === String(clubId)
      }),
    [trainers, clubId],
  )
  const holdingId = holdingTrainers[0]?.id ? String(holdingTrainers[0].id) : ''

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
      setPlan(planDeskClosingImport({ parsedRows: parsed.rows, clients, membershipsByClientId }))
    } catch (e) {
      setError(e?.message || 'Не удалось прочитать файл')
      setPlan(null)
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async () => {
    if (!plan?.counts?.create) return
    if (!holdingId) {
      setError(
        `Сначала создайте тренера с именем «${HOLDING_TRAINER_DISPLAY_NAME}» в этом клубе (Организация), затем повторите.`,
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await applyDeskClosingCreates({
        actions: plan.actions,
        clubId,
        holdingTrainerId: holdingId,
      })
      if (!res.ok && res.created === 0) {
        setError(res.error || res.errors?.join('; ') || 'Не создано')
      } else {
        setResultMsg(
          `Создано карточек: ${res.created}` +
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

  return (
    <section className="admin-desk-closing" aria-label="Импорт закрывающихся договоров">
      <h3 className="admin-section-title">Desk: закрывающиеся договоры (ПЗ/ТЗ/АЗ)</h3>
      <p className="muted" style={{ marginBottom: '0.75rem' }}>
        Загрузка Excel с колонками карта + ФИО + дата окончания. Новые клиенты — на тренера «
        {HOLDING_TRAINER_DISPLAY_NAME}». Живые абоны не затираем. Нужен для отчёта продаж и «Истекает».
      </p>
      {!holdingId ? (
        <p className="sales-report__error">
          Нет тренера «{HOLDING_TRAINER_DISPLAY_NAME}» в клубе — создайте в Организации, иначе сид не запишет.
        </p>
      ) : (
        <p className="muted">Holding: {holdingTrainers[0]?.name}</p>
      )}
      <label className="sales-payments-import__file">
        <FileSpreadsheet size={18} aria-hidden />
        <span>{busy ? 'Читаю…' : fileName || 'Выбрать .xlsx закрытий'}</span>
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
            Итого: создать {plan.counts.create}, пропуск {plan.counts.skip}, конфликт {plan.counts.conflict}
          </p>
          <div className="sales-payments-import__table-wrap">
            <table className="sales-payments-import__table">
              <thead>
                <tr>
                  <th>Действие</th>
                  <th>Карта</th>
                  <th>ФИО</th>
                  <th>Конец</th>
                  <th>Причина</th>
                </tr>
              </thead>
              <tbody>
                {plan.actions.slice(0, 80).map((a) => (
                  <tr key={`${a.cardNumber}-${a.action}-${a.endDate}`}>
                    <td>{a.action}</td>
                    <td>{a.cardNumber}</td>
                    <td>{a.name}</td>
                    <td>{a.endDate || '—'}</td>
                    <td className="sales-payments-import__reason">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !plan.counts.create || !holdingId}
            onClick={() => void handleApply()}
          >
            Создать {plan.counts.create} desk-карточек
          </button>
        </>
      ) : null}
    </section>
  )
}
