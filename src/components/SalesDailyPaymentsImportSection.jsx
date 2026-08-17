import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { listClientsByClubId, listMembershipsByClubId, listTrainingsForClientIds } from '../lib/localDbClubQuery.js'
import { pullAdminClientsFromCloud } from '../lib/admin/adminClientsListService.js'
import {
  buildDailyFormFromPaymentLines,
  canApplyPaymentsImportToReportDate,
  dailyFormHasFilledSalesMatrix,
  enrichSalesPaymentLines,
  mergePaymentImportIntoDailyForm,
} from '../lib/admin/salesPaymentsImportCore.js'
import { matchClientsByCardNumber } from '../lib/admin/salesClientMatchCore.js'
import { parseSalesPaymentsXlsxFile } from '../lib/admin/salesPaymentsImportWorkbook.js'
import { isSupabaseConfigured } from '../lib/supabase'
import { SalesPaymentsClientLinkSection } from './SalesPaymentsClientLinkSection.jsx'

const BUCKETS = [
  { key: 'nk', label: 'НК' },
  { key: 'dk', label: 'ДК' },
  { key: 'uk', label: 'УК' },
]

/**
 * Импорт Excel «Отчёт по оплатам» → превью строк → подставить в форму дня.
 * @param {{
 *   clubId: string,
 *   reportDate: string,
 *   dailyForm?: Record<string, string>,
 *   canEdit?: boolean,
 *   onApplyForm: (form: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void,
 *   onToast?: (msg: string, opts?: { variant?: string }) => void,
 *   onReportDateHint?: (iso: string) => void,
 * }} props
 */
export function SalesDailyPaymentsImportSection({
  clubId,
  reportDate,
  dailyForm,
  canEdit = true,
  onApplyForm,
  onToast,
  onReportDateHint,
}) {
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [lines, setLines] = useState(null)
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState('')
  const loadGenRef = useRef(0)

  const toast = (msg, opts) => {
    if (typeof onToast === 'function') onToast(msg, opts)
  }

  /** Сброс превью файла (уже подставленную форму дня не трогаем). */
  const clearImport = () => {
    loadGenRef.current += 1
    setBusy(false)
    setFileName('')
    setLines(null)
    setMeta(null)
    setError('')
  }

  const handleFile = async (file) => {
    if (!file || !clubId || !canEdit) return
    const gen = ++loadGenRef.current
    setBusy(true)
    setError('')
    setFileName(file.name || '')
    try {
      const parsed = await parseSalesPaymentsXlsxFile(file)
      if (gen !== loadGenRef.current) return
      if (parsed.periodRange) {
        setLines([])
        setMeta(parsed)
        setError(parsed.reasons?.[0] || 'Файл за период, не за один день.')
        return
      }
      if (!parsed.lines.length) {
        setLines([])
        setMeta(parsed)
        setError(
          parsed.reasons?.find((r) => /даты периода/i.test(r)) ||
            'В файле не найдено строк продаж (карта + сумма). Проверьте формат «Отчёт по оплатам».',
        )
        return
      }
      if (isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await pullAdminClientsFromCloud(clubId, { mode: 'active' })
        } catch {
          /* офлайн / API — ниже локальный кэш */
        }
      }
      if (gen !== loadGenRef.current) return
      const [clients, memberships] = await Promise.all([
        listClientsByClubId(clubId),
        listMembershipsByClubId(clubId),
      ])
      if (gen !== loadGenRef.current) return
      /** @type {Record<string, object[]>} */
      const membershipsByClientId = {}
      for (const m of memberships ?? []) {
        const cid = String(m?.client_id ?? '')
        if (!cid) continue
        if (!membershipsByClientId[cid]) membershipsByClientId[cid] = []
        membershipsByClientId[cid].push(m)
      }
      const saleDate = parsed.reportDate || reportDate
      const matchedIds = []
      for (const line of parsed.lines) {
        const match = matchClientsByCardNumber(clients ?? [], line.cardNumber, {
          preferOperational: true,
          paymentName: line.name,
        })
        if (match.client?.id) matchedIds.push(String(match.client.id))
      }
      const uniqueIds = [...new Set(matchedIds)]
      const trainings = uniqueIds.length
        ? await listTrainingsForClientIds(uniqueIds, { clubId })
        : []
      if (gen !== loadGenRef.current) return
      /** @type {Record<string, object[]>} */
      const trainingsByClientId = {}
      for (const t of trainings) {
        const cid = String(t?.client_id ?? '')
        if (!cid) continue
        if (!trainingsByClientId[cid]) trainingsByClientId[cid] = []
        trainingsByClientId[cid].push(t)
      }
      const enriched = enrichSalesPaymentLines({
        lines: parsed.lines,
        reportDate: saleDate,
        clients: clients ?? [],
        membershipsByClientId,
        trainingsByClientId,
      })
      if (gen !== loadGenRef.current) return
      setLines(enriched)
      setMeta(parsed)
      const gate = canApplyPaymentsImportToReportDate(parsed, reportDate)
      if (!gate.ok) {
        setError(gate.error)
      }
      toast(`Разобрано строк: ${enriched.length}`)
    } catch (e) {
      if (gen !== loadGenRef.current) return
      console.error(e)
      setError(e?.message || 'Не удалось прочитать файл')
      setLines(null)
    } finally {
      if (gen === loadGenRef.current) setBusy(false)
    }
  }

  const patchLine = (id, patch) => {
    setLines((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const applyToForm = () => {
    if (!lines?.length) return
    const gate = canApplyPaymentsImportToReportDate(meta ?? {}, reportDate)
    if (!gate.ok) {
      setError(gate.error)
      return
    }
    const need = lines.filter((l) => l.include !== false && l.hall !== 'dop' && !l.profitBucket)
    if (need.length) {
      setError(`Укажите НК/ДК/УК для ${need.length} строк (или снимите «в отчёт»)`)
      return
    }
    if (dailyFormHasFilledSalesMatrix(dailyForm)) {
      const ok = window.confirm(
        'Подставить заменит суммы НК/ДК/УК и доп. в этом дне. ПНК, тренировки и возвраты (если их нет в файле) останутся. Продолжить?',
      )
      if (!ok) return
    }
    const built = buildDailyFormFromPaymentLines(lines)
    onApplyForm((prev) =>
      mergePaymentImportIntoDailyForm(prev, built.form, { refundsAmount: meta?.refundsAmount }),
    )
    setError('')
    toast(
      `В форму: ${built.included} строк, сумма ячеек ≈ ${Math.round(built.matrixSum)} ₽. Проверьте и нажмите «Сохранить».`,
    )
  }

  const hasImport = Boolean(fileName || meta || error || lines !== null)
  const dateGate = meta
    ? canApplyPaymentsImportToReportDate(meta, reportDate)
    : { ok: false }
  const warningReasons = (meta?.reasons ?? []).filter(
    (r) => !/не за один день|даты периода/i.test(r),
  )

  if (!canEdit) return null

  return (
    <section className="sales-report__card sales-payments-import sales-daily-excel-card" aria-label="Импорт отчёта по оплатам">
      <h3 className="sales-report__section-title">Каждый день: Excel оплат из 1С</h3>
      <p className="sales-report__hint sales-daily-excel-card__lead">
        Файл <strong>31.xlsx</strong> — оплаты <strong>за один день</strong> (не закрытия и не месяц). НК/ДК/УК →
        «Подставить» → «Сохранить». Ниже — карточки, кого ещё нет в базе данных. «Отмена» — сбросить выбранный файл.
      </p>
      <label className="sales-payments-import__file">
        <FileSpreadsheet size={18} aria-hidden />
        <span>{busy ? 'Читаю…' : fileName || 'Выбрать .xlsx'}</span>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy || !clubId}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            void handleFile(f)
          }}
        />
      </label>
      {meta?.reportDate ? (
        <p className="sales-report__hint">
          Дата в файле: <strong>{meta.reportDate}</strong>
          {meta.fileTotal != null ? ` · итог файла ${meta.fileTotal} ₽` : ''}
          {meta.linesSum != null ? ` · в строках ${meta.linesSum} ₽` : ''}
        </p>
      ) : null}
      {dateGate.fileDate && !dateGate.ok && onReportDateHint ? (
        <p className="sales-report__hint">
          <button
            type="button"
            className="btn btn-ghost btn-touch"
            onClick={() => onReportDateHint(dateGate.fileDate)}
          >
            Открыть день файла ({dateGate.fileDate})
          </button>
        </p>
      ) : null}
      {warningReasons.length ? (
        <ul className="sales-payments-import__reasons">
          {warningReasons.slice(0, 8).map((r) => (
            <li key={r}>{r}</li>
          ))}
          {warningReasons.length > 8 ? <li>…ещё {warningReasons.length - 8}</li> : null}
        </ul>
      ) : null}
      {error ? <p className="sales-report__error">{error}</p> : null}

      {lines?.length ? (
        <div className="sales-payments-import__table-wrap">
          <table className="sales-payments-import__table">
            <thead>
              <tr>
                <th>В отчёт</th>
                <th>Карта</th>
                <th>Клиент</th>
                <th>Зал</th>
                <th>Тариф</th>
                <th>₽</th>
                <th>Сегмент</th>
                <th>Подсказка</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className={l.include === false ? 'is-skipped' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={l.include !== false}
                      onChange={(e) => patchLine(l.id, { include: e.target.checked })}
                      aria-label="Включить в отчёт"
                    />
                  </td>
                  <td>{l.cardNumber}</td>
                  <td>{l.clientName || l.name}</td>
                  <td>{String(l.hall || '—').toUpperCase()}</td>
                  <td>{l.tariffName}</td>
                  <td>{l.amount}</td>
                  <td>
                    {l.hall === 'dop' ? (
                      <span className="sales-report__hint">доп.</span>
                    ) : (
                      <div className="sales-payments-import__buckets" role="group" aria-label="НК ДК УК">
                        {BUCKETS.map((b) => (
                          <label key={b.key} className="sales-payments-import__bucket">
                            <input
                              type="radio"
                              name={`bucket-${l.id}`}
                              checked={l.profitBucket === b.key}
                              onChange={() => patchLine(l.id, { profitBucket: b.key })}
                            />
                            {b.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="sales-payments-import__reason">{l.bucketReason || l.matchReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {hasImport ? (
        <div className="sales-excel-import__actions">
          <button
            type="button"
            className="btn btn-ghost btn-touch"
            onClick={clearImport}
            title="Сбросить выбранный файл и таблицу (форму дня не откатывает)"
          >
            Отмена
          </button>
          {lines?.length ? (
            <button
              type="button"
              className="btn btn-primary btn-touch"
              onClick={applyToForm}
              disabled={busy || !dateGate.ok}
            >
              <Upload size={16} aria-hidden /> Подставить в форму дня
            </button>
          ) : null}
        </div>
      ) : null}

      {lines?.length ? (
        <SalesPaymentsClientLinkSection
          clubId={clubId}
          reportDate={meta?.reportDate || reportDate}
          lines={lines}
          canEdit={canEdit}
          onToast={onToast}
        />
      ) : null}
    </section>
  )
}
