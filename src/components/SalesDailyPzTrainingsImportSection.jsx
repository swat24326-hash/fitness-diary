import { useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { parsePzTrainingsReportXlsxFile } from '../lib/admin/pzTrainingsReportImportWorkbook.js'
import { pzTrainingsReportDateMatches } from '../lib/admin/pzTrainingsReportImportCore.js'

/**
 * Ежедневный Excel часов ПЗ (otchet_pz) → матрица тренер × тип.
 * Контур отчёта продаж; не статистика планшетов.
 *
 * @param {{
 *   clubId: string,
 *   reportDate: string,
 *   trainers?: Array<{ id: string, name?: string }>,
 *   membershipTypes?: Array<{ id: string, code?: string, trainer_assignable?: boolean }>,
 *   canEdit?: boolean,
 *   onApplyMatrix: (matrix: Record<string, string>) => void,
 *   onToast?: (msg: string, opts?: { variant?: string }) => void,
 * }} props
 */
export function SalesDailyPzTrainingsImportSection({
  clubId,
  reportDate,
  trainers = [],
  membershipTypes = [],
  canEdit = true,
  onApplyMatrix,
  onToast,
}) {
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  const toast = (msg, opts) => {
    if (typeof onToast === 'function') onToast(msg, opts)
  }

  const handleFile = async (file) => {
    if (!file || !clubId || !canEdit) return
    setBusy(true)
    setError('')
    setPreview(null)
    setFileName(file.name || '')
    try {
      const result = await parsePzTrainingsReportXlsxFile(file, {
        trainers,
        membershipTypes,
      })
      if (!result.ok) {
        setError(result.error || 'Не удалось прочитать файл')
        return
      }
      setPreview(result)
      if (result.reportDate && !pzTrainingsReportDateMatches(result.reportDate, reportDate)) {
        toast(
          `Дата в файле ${result.reportDate}, в отчёте ${reportDate}. Смените день отчёта или загрузите другой файл.`,
          { variant: 'warn' },
        )
      }
    } catch (e) {
      setError(e?.message ?? 'Ошибка чтения Excel')
    } finally {
      setBusy(false)
    }
  }

  const dateOk = useMemo(() => {
    if (!preview?.reportDate) return false
    return pzTrainingsReportDateMatches(preview.reportDate, reportDate)
  }, [preview, reportDate])

  const canApply =
    canEdit &&
    preview &&
    dateOk &&
    preview.matchedTotal > 0 &&
    typeof onApplyMatrix === 'function'

  const apply = () => {
    if (!canApply) return
    onApplyMatrix(preview.matrixInput)
    toast(
      `Часы ПЗ: подставлено ${preview.matchedTotal} из ${preview.fileTotal} (файл). Сохраните отчёт.`,
    )
    setPreview(null)
    setFileName('')
  }

  return (
    <section className="sales-report__card sales-payments-import sales-daily-excel-card" aria-label="Excel часов ПЗ">
      <h3 className="sales-report__section-title">Каждый день: Excel часов ПЗ</h3>
      <p className="sales-report__hint sales-daily-excel-card__lead">
        Файл <strong>otchet_pz.xlsx</strong> — тренер × тип карты. Отчёт менеджера, не статистика планшетов.
        «Подставить» → матрица ниже → «Сохранить».
      </p>
      <label className={`sales-payments-import__file${canEdit ? '' : ' sales-payments-import__file--disabled'}`}>
        <FileSpreadsheet size={18} aria-hidden />
        <span>{busy ? 'Читаю…' : fileName || 'Выбрать .xlsx'}</span>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={!canEdit || busy || !clubId}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            void handleFile(f)
          }}
        />
      </label>
      {error ? (
        <p className="sync-feedback sync-feedback--warn" role="alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="sales-daily-excel-card__preview">
          <p className="muted" style={{ margin: '0.5rem 0', fontSize: 13 }}>
            Файл: <strong>{preview.fileTotal}</strong> · в Ось попадёт:{' '}
            <strong>{preview.matchedTotal}</strong>
            {preview.reportDate ? (
              <>
                {' '}
                · дата файла <strong>{preview.reportDate}</strong>
                {!dateOk ? ' (не совпадает с отчётом)' : null}
              </>
            ) : null}
          </p>
          {preview.unmatchedTrainers?.length ? (
            <p className="muted" style={{ fontSize: 12, margin: '0.25rem 0' }}>
              Нет в Оси (тренеры): {preview.unmatchedTrainers.slice(0, 6).join(', ')}
              {preview.unmatchedTrainers.length > 6 ? '…' : ''}
            </p>
          ) : null}
          {preview.unmatchedColumns?.length ? (
            <p className="muted" style={{ fontSize: 12, margin: '0.25rem 0' }}>
              Не сопоставлены типы: {preview.unmatchedColumns.join(', ')}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary btn-touch"
            disabled={!canApply}
            onClick={apply}
            style={{ marginTop: '0.5rem' }}
          >
            Подставить в матрицу
          </button>
        </div>
      ) : null}
    </section>
  )
}
