import { useCallback, useRef } from 'react'
import { Printer } from 'lucide-react'
import {
  buildOwnerMonthBriefModelFromPanel,
  buildOwnerMonthBriefPlainText,
} from '../../lib/admin/iskraOwnerBriefCore.js'
import '../../styles/iskra-owner-brief.css'

/**
 * Бриф месяца для собственника — печать / «Сохранить как PDF».
 * Данные с prefetch панели (без повторной загрузки snapshot).
 */
export function IskraOwnerMonthBriefButton({
  clubName = '',
  periodLabel = '',
  kpi = null,
  sparkBrief = null,
  insightCards = [],
  momGlance = null,
  forecastConfidence = null,
  outcomes = [],
  disabled = false,
  className = '',
}) {
  const printRef = useRef(null)

  const onPrint = useCallback(() => {
    if (disabled || !kpi) return
    const model = buildOwnerMonthBriefModelFromPanel({
      clubName,
      periodLabel,
      kpi,
      sparkBrief,
      insightCards,
      momGlance,
      forecastConfidence,
      outcomes,
    })
    const node = printRef.current
    if (!node) return
    node.innerHTML = ''
    const root = document.createElement('div')
    root.className = 'iskra-owner-brief'
    root.innerHTML = [
      `<h1>${escapeHtml(model.title)}</h1>`,
      `<p class="iskra-owner-brief__sub">${escapeHtml(model.subtitle)}</p>`,
      `<ul class="iskra-owner-brief__kpi">${model.kpiRows
        .map((r) => `<li><strong>${escapeHtml(r.label)}</strong> ${escapeHtml(r.value)}</li>`)
        .join('')}</ul>`,
      model.momLine ? `<p>${escapeHtml(model.momLine)}</p>` : '',
      model.outcomeLine ? `<p class="iskra-owner-brief__outcome">${escapeHtml(model.outcomeLine)}</p>` : '',
      model.forecastLine ? `<p>${escapeHtml(model.forecastLine)}</p>` : '',
      model.risks?.length
        ? `<h2>Риски</h2><ul>${model.risks.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
        : '',
      model.actions?.length
        ? `<h2>Действия</h2><ul>${model.actions
            .map(
              (a) =>
                `<li><strong>${escapeHtml(a.title)}</strong>${
                  a.impact ? ` — ${escapeHtml(a.impact)}` : ''
                }${a.action ? `<div>${escapeHtml(a.action)}</div>` : ''}</li>`,
            )
            .join('')}</ul>`
        : '',
      `<p class="iskra-owner-brief__footer">${escapeHtml(model.footer)}</p>`,
      `<pre class="iskra-owner-brief__plain">${escapeHtml(buildOwnerMonthBriefPlainText(model))}</pre>`,
    ].join('')
    node.appendChild(root)
    document.body.classList.add('iskra-printing-brief')
    window.print()
    window.setTimeout(() => {
      document.body.classList.remove('iskra-printing-brief')
    }, 300)
  }, [
    kpi,
    sparkBrief,
    insightCards,
    momGlance,
    forecastConfidence,
    outcomes,
    clubName,
    periodLabel,
    disabled,
  ])

  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost btn-sm iskra-owner-brief-btn${className ? ` ${className}` : ''}`}
        disabled={disabled || !kpi}
        title="Бриф месяца для собственника — печать или PDF"
        aria-label="Бриф месяца для собственника"
        onClick={onPrint}
      >
        <Printer size={16} aria-hidden />
        <span>Бриф</span>
      </button>
      <div ref={printRef} className="iskra-owner-brief-print-root" aria-hidden />
    </>
  )
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
