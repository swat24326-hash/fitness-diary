import { useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { listClientsByClubId, listMembershipsByClubId } from '../lib/localDbClubQuery.js'
import {
  buildDailyFormFromPaymentLines,
  enrichSalesPaymentLines,
} from '../lib/admin/salesPaymentsImportCore.js'
import { parseSalesPaymentsXlsxFile } from '../lib/admin/salesPaymentsImportWorkbook.js'
import { emptyDailyForm } from '../lib/admin/salesReportCore.js'
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
 *   canEdit?: boolean,
 *   onApplyForm: (form: Record<string, string>) => void,
 *   onToast?: (msg: string, opts?: { variant?: string }) => void,
 *   onReportDateHint?: (iso: string) => void,
 * }} props
 */
export function SalesDailyPaymentsImportSection({
  clubId,
  reportDate,
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

  const toast = (msg) => {
    if (typeof onToast === 'function') onToast(msg)
  }

  const handleFile = async (file) => {
    if (!file || !clubId || !canEdit) return
    setBusy(true)
    setError('')
    setFileName(file.name || '')
    try {
      const parsed = await parseSalesPaymentsXlsxFile(file)
      if (!parsed.lines.length) {
        setLines([])
        setMeta(parsed)
        setError('В файле не найдено строк продаж (карта + сумма). Проверьте формат «Отчёт по оплатам».')
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
      const saleDate = parsed.reportDate || reportDate
      if (parsed.reportDate && parsed.reportDate !== reportDate && onReportDateHint) {
        onReportDateHint(parsed.reportDate)
      }
      const enriched = enrichSalesPaymentLines({
        lines: parsed.lines,
        reportDate: saleDate,
        clients: clients ?? [],
        membershipsByClientId,
      })
      setLines(enriched)
      setMeta(parsed)
      toast(`Разобрано строк: ${enriched.length}`)
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Не удалось прочитать файл')
      setLines(null)
    } finally {
      setBusy(false)
    }
  }

  const patchLine = (id, patch) => {
    setLines((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const applyToForm = () => {
    if (!lines?.length) return
    const need = lines.filter((l) => l.include !== false && l.hall !== 'dop' && !l.profitBucket)
    if (need.length) {
      setError(`Укажите НК/ДК/УК для ${need.length} строк (или снимите «в отчёт»)`)
      return
    }
    const built = buildDailyFormFromPaymentLines(lines)
    const next = { ...emptyDailyForm(), ...built.form }
    onApplyForm(next)
    setError('')
    toast(
      `В форму: ${built.included} строк, сумма ячеек ≈ ${Math.round(built.matrixSum)} ₽. Проверьте и нажмите «Сохранить».`,
    )
  }

  if (!canEdit) return null

  return (
    <section className="sales-report__card sales-payments-import" aria-label="Импорт отчёта по оплатам">
      <h3 className="sales-report__section-title">Каждый день: Excel оплат из 1С</h3>
      <p className="sales-report__hint sales-daily-excel-card__lead">
        Файл <strong>31.xlsx</strong> — оплаты за день (не закрытия). НК/ДК/УК → «Подставить» → «Сохранить».
        Ниже — карточки, кого ещё нет в базе данных.
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
        </p>
      ) : null}
      {error ? <p className="sales-report__error">{error}</p> : null}

      {lines?.length ? (
        <>
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
          <button type="button" className="btn btn-primary" onClick={applyToForm} disabled={busy}>
            <Upload size={16} aria-hidden /> Подставить в форму дня
          </button>

          <SalesPaymentsClientLinkSection
            clubId={clubId}
            reportDate={meta?.reportDate || reportDate}
            lines={lines}
            canEdit={canEdit}
            onToast={onToast}
          />
        </>
      ) : null}
    </section>
  )
}
