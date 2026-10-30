/**
 * «Мой прогресс»: график ●/○, обмеры, шторка записи.
 * Добавить вес/обмеры — из меню ⋮ (addRequest); свои ○ — тапом по точке.
 */
import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import {
  previewDeleteMeasure,
  previewDeleteWeight,
  previewUpsertMeasure,
  previewUpsertWeight,
} from '../../lib/client/clientProgressSelfCore.js'
import {
  deleteClientSelfMeasure,
  deleteClientSelfWeight,
  upsertClientSelfMeasure,
  upsertClientSelfWeight,
} from '../../lib/client/clientProgressSelfService.js'
import { ClientMeasuresFold } from './ClientMeasuresFold.jsx'
import { ClientProgressSelfSheet } from './ClientProgressSelfSheet.jsx'
import { ClientWeightSpark } from './ClientWeightSpark.jsx'

function ProgressCardShell({ children }) {
  return (
    <section className="client-me-card">
      <h2 className="client-me-card__title">
        <TrendingUp size={18} aria-hidden />
        Мой прогресс
      </h2>
      {children}
    </section>
  )
}

/**
 * @param {{
 *   progress: object
 *   asOf: string
 *   sparkBuild?: number
 *   sparkSettling?: boolean
 *   localOnly?: boolean
 *   addRequest?: null | 'weight' | 'measure'
 *   onAddRequestConsumed?: () => void
 *   onProgressSaved?: (progress: object) => void
 * }} props
 */
export function ClientProgressSection({
  progress,
  asOf,
  sparkBuild = 0,
  sparkSettling = false,
  localOnly = false,
  addRequest = null,
  onAddRequestConsumed,
  onProgressSaved,
}) {
  const p = progress ?? {}
  const weights = p.weights ?? []
  const [sheet, setSheet] = useState(/** @type {null | { kind: 'weight'|'measure', initial?: object }} */ (null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const openWeight = (initial) => {
    setError('')
    setSheet({ kind: 'weight', initial })
  }
  const openMeasure = (initial) => {
    setError('')
    setSheet({ kind: 'measure', initial })
  }

  useEffect(() => {
    if (addRequest !== 'weight' && addRequest !== 'measure') return
    if (addRequest === 'weight') openWeight({ date: asOf })
    else openMeasure({ date: asOf })
    onAddRequestConsumed?.()
  }, [addRequest, asOf, onAddRequestConsumed])

  const finish = (nextProgress) => {
    onProgressSaved?.(nextProgress)
    setSheet(null)
    setBusy(false)
    setError('')
  }

  const save = async (payload) => {
    setBusy(true)
    setError('')
    try {
      if (localOnly) {
        const local =
          sheet?.kind === 'weight' ? previewUpsertWeight(p, payload) : previewUpsertMeasure(p, payload)
        if (!local.ok) {
          setBusy(false)
          setError(local.error || 'Не сохранилось')
          return
        }
        finish(local.progress)
        return
      }
      const res =
        sheet?.kind === 'weight' ? await upsertClientSelfWeight(payload) : await upsertClientSelfMeasure(payload)
      if (!res?.progress) throw new Error(res?.error || 'Не сохранилось')
      finish(res.progress)
    } catch (e) {
      setBusy(false)
      setError(e?.message || 'Не получилось сохранить')
    }
  }

  const remove = async () => {
    const id = sheet?.initial?.id
    if (!id) return
    setBusy(true)
    setError('')
    try {
      if (localOnly) {
        const local = sheet?.kind === 'weight' ? previewDeleteWeight(p, id) : previewDeleteMeasure(p, id)
        finish(local.progress)
        return
      }
      const res = sheet?.kind === 'weight' ? await deleteClientSelfWeight(id) : await deleteClientSelfMeasure(id)
      if (!res?.progress) throw new Error(res?.error || 'Не удалилось')
      finish(res.progress)
    } catch (e) {
      setBusy(false)
      setError(e?.message || 'Не получилось удалить')
    }
  }

  return (
    <>
      <ProgressCardShell>
        {weights.length ? (
          <ClientWeightSpark
            key={sparkBuild}
            weights={weights}
            settling={sparkSettling}
            rebuilt={sparkBuild > 0}
            onPickSelf={(dot) => openWeight({ id: dot.id, date: dot.date, kg: dot.kg })}
          />
        ) : (
          <p className="client-me-muted">Пока нет замеров веса.</p>
        )}
        <ClientMeasuresFold
          measurements={p.measurements}
          onEditSelf={(m) => openMeasure({ id: m.id, date: m.date, values: m.values })}
        />
      </ProgressCardShell>
      {sheet ? (
        <ClientProgressSelfSheet
          kind={sheet.kind}
          asOf={asOf}
          initial={sheet.initial}
          busy={busy}
          error={error}
          onClose={() => !busy && setSheet(null)}
          onSave={save}
          onDelete={sheet.initial?.id ? remove : undefined}
        />
      ) : null}
    </>
  )
}
