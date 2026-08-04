import { useEffect, useState } from 'react'
import { Route } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { buildStrategyPlaybookFromSuggest } from '../lib/admin/salesStrategyPlaybookService.js'
import { SalesStrategyPlaybookWeekCard } from './SalesStrategyPlaybookWeekCard.jsx'
import { SalesStrategyPlaybookHallListsMenu } from './SalesStrategyPlaybookHallListsMenu.jsx'

/**
 * Пошаговое выполнение плана: недели после расчёта пакета.
 *
 * @param {{
 *   year: number,
 *   month: number,
 *   clubId?: string,
 *   renewalsSuggest?: object|null,
 *   topUpPack?: object|null,
 *   monthDays?: object[],
 * }} props
 */
export function SalesStrategyPlaybookSection({
  year,
  month,
  clubId = '',
  renewalsSuggest = null,
  topUpPack = null,
  monthDays = [],
}) {
  const [active, setActive] = useState(0)

  const playbook = buildStrategyPlaybookFromSuggest({
    year,
    month,
    renewalsSuggest,
    topUpPack,
    monthDays,
  })

  const activeIndex = playbook?.ok ? playbook.activeIndex : 0
  useEffect(() => {
    setActive(activeIndex)
  }, [activeIndex, year, month])

  if (!playbook?.ok) return null

  const week = playbook.weeks[active] ?? playbook.weeks[0]
  const monthPct = Math.min(100, Math.max(0, Number(playbook.monthProgress?.pct) || 0))

  return (
    <section className="sales-playbook" aria-labelledby="sales-playbook-title">
      <header className="sales-playbook__head">
        <div className="sales-playbook__head-text">
          <p className="sales-playbook__eyebrow">
            <Route size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            Выполнение плана
          </p>
          <h3 className="sales-playbook__title" id="sales-playbook-title">
            Playbook месяца
          </h3>
          <p className="muted sales-playbook__lead">
            Недели с темпом от пакета, закрытия ДК на неделю и ориентир НК/УК. Прогресс месяца — из
            отчётов продаж (не из галочек). Галочка «купил» — когда в базе уже есть следующий абон;
            после вечера / планшета нажмите «Посчитать» ещё раз. Бургер справа от недель — все
            закрытия зала за месяц.
          </p>
        </div>
        <div className="sales-playbook__month-kpi">
          <span className="muted">Месяц</span>
          <strong>
            {formatRub(playbook.monthProgress.fact)} / {formatRub(playbook.packTotal)}
          </strong>
          <div className="sales-playbook__bar sales-playbook__bar--month" aria-hidden>
            <div className="sales-playbook__bar-fill" style={{ width: `${monthPct}%` }} />
          </div>
          <span className="muted">
            {playbook.monthProgress.pct}% · {playbook.endingsOpenTotal ?? playbook.endingsTotal}{' '}
            откр.
            {(playbook.endingsConfirmedTotal ?? 0) > 0
              ? ` · ${playbook.endingsConfirmedTotal} ✓`
              : ''}
          </span>
        </div>
      </header>

      <div className="sales-playbook__weeks-row">
        <div className="sales-playbook__weeks" role="tablist" aria-label="Недели плана">
          {playbook.weeks.map((w, i) => {
            const done = Math.min(100, Math.max(0, Number(w.progress?.pct) || 0))
            return (
              <button
                key={w.label}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`sales-playbook__week-chip${i === active ? ' is-active' : ''}${
                  w.isCurrent ? ' is-current' : ''
                }${w.isPast ? ' is-past' : ''}`}
                onClick={() => setActive(i)}
              >
                <span className="sales-playbook__week-chip-label">{w.label}</span>
                <span className="sales-playbook__week-chip-pct">{done}%</span>
                <span className="sales-playbook__week-chip-meta muted">
                  {w.endingsOpenCount ?? w.endingsCount} откр.
                  {(w.endingsConfirmedCount ?? 0) > 0 ? ` · ${w.endingsConfirmedCount} ✓` : ''}
                </span>
              </button>
            )
          })}
        </div>
        <SalesStrategyPlaybookHallListsMenu playbook={playbook} clubId={clubId} />
      </div>

      <SalesStrategyPlaybookWeekCard week={week} clubId={clubId} />
    </section>
  )
}
