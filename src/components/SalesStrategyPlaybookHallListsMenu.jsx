import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import { HALL_RENEWALS_HALLS } from '../lib/admin/salesPlanHallRenewalsSuggestCore.js'
import {
  describeHallClosingsListMetaRu,
  filterPlaybookClosingsByHall,
  flattenPlaybookEndings,
  PLAYBOOK_HALL_LIST_TITLES,
  summarizePlaybookClosingsByHall,
  sumPlaybookClosingsAmount,
} from '../lib/admin/salesStrategyPlaybookHallListsCore.js'
import { SalesStrategyPlaybookClosingsList } from './SalesStrategyPlaybookClosingsList.jsx'

/**
 * Бургер у чипов недель: полные списки закрытий ПЗ / ТЗ / АЗ за месяц.
 *
 * @param {{
 *   playbook: object,
 *   clubId?: string,
 * }} props
 */
export function SalesStrategyPlaybookHallListsMenu({ playbook, clubId = '' }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeHall, setActiveHall] = useState(/** @type {'pz'|'tz'|'az'|null} */ (null))
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))

  const allEndings = useMemo(() => flattenPlaybookEndings(playbook), [playbook])
  const summary = useMemo(() => summarizePlaybookClosingsByHall(allEndings), [allEndings])
  const hallEndings = useMemo(
    () => (activeHall ? filterPlaybookClosingsByHall(allEndings, activeHall) : []),
    [activeHall, allEndings],
  )
  const hallAmount = useMemo(() => sumPlaybookClosingsAmount(hallEndings), [hallEndings])
  const listMeta = describeHallClosingsListMetaRu({
    count: hallEndings.length,
    amount: hallAmount,
  })

  useEffect(() => {
    if (!menuOpen && !activeHall) return undefined
    const onDoc = (e) => {
      if (menuOpen && !rootRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (menuOpen) setMenuOpen(false)
      else if (activeHall) setActiveHall(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, activeHall])

  const openHall = (hall) => {
    setActiveHall(hall)
    setMenuOpen(false)
  }

  const closePanel = () => setActiveHall(null)

  return (
    <>
      <div className="sales-playbook__hall-menu" ref={rootRef}>
        <button
          type="button"
          className={`sales-playbook__burger btn btn-secondary btn-icon-square btn-touch${
            activeHall ? ' is-active' : ''
          }`}
          aria-label="Списки закрытий по залам"
          aria-expanded={menuOpen || Boolean(activeHall)}
          aria-haspopup="menu"
          title="Все закрытия по залам"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Menu size={20} aria-hidden />
        </button>

        {menuOpen ? (
          <div className="sales-playbook__burger-panel" role="menu" aria-label="Закрытия по залам">
            <p className="sales-playbook__burger-lead muted">
              Весь месяц — не только выбранная неделя. Дата, зал, ориентир оплаты, контакты.
            </p>
            {summary.halls.map((h) => (
              <button
                key={h.hall}
                type="button"
                role="menuitem"
                className={`sales-playbook__burger-item${
                  activeHall === h.hall ? ' is-active' : ''
                }`}
                onClick={() => openHall(h.hall)}
              >
                <span className="sales-playbook__burger-item-title">
                  {PLAYBOOK_HALL_LIST_TITLES[h.hall]}
                </span>
                <span className="sales-playbook__burger-item-meta muted">
                  {h.count} на {formatRub(h.amount)}
                  {h.openCount !== h.count ? ` · ${h.openCount} откр.` : ''}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {activeHall ? (
        <section
          className="sales-playbook__hall-sheet"
          role="region"
          aria-label={PLAYBOOK_HALL_LIST_TITLES[activeHall]}
        >
          <header className="sales-playbook__hall-sheet-head">
            <div className="sales-playbook__hall-sheet-titles">
              <h4 className="sales-playbook__hall-sheet-title">
                {PLAYBOOK_HALL_LIST_TITLES[activeHall]}
              </h4>
              <p className="sales-playbook__hall-sheet-meta">{listMeta}</p>
              <p className="muted sales-playbook__hall-sheet-hint">По дате окончания абона</p>
            </div>
            <div className="sales-playbook__hall-sheet-kpis" aria-hidden={hallEndings.length === 0}>
              <div className="sales-playbook__hall-kpi">
                <span className="sales-playbook__hall-kpi-label">Человек</span>
                <strong className="sales-playbook__hall-kpi-value">
                  {new Intl.NumberFormat('ru-RU').format(hallEndings.length)}
                </strong>
              </div>
              <div className="sales-playbook__hall-kpi sales-playbook__hall-kpi--accent">
                <span className="sales-playbook__hall-kpi-label">Сумма ориентира</span>
                <strong className="sales-playbook__hall-kpi-value">{formatRub(hallAmount)}</strong>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon-square btn-touch sales-playbook__hall-sheet-close"
              aria-label="Закрыть список"
              onClick={closePanel}
            >
              <X size={18} aria-hidden />
            </button>
          </header>

          <div className="sales-playbook__hall-tabs" role="tablist" aria-label="Зал">
            {HALL_RENEWALS_HALLS.map((def) => {
              const h = summary.byHall[def.hall]
              const selected = activeHall === def.hall
              return (
                <button
                  key={def.hall}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`sales-playbook__hall-tab${selected ? ' is-active' : ''}`}
                  onClick={() => setActiveHall(def.hall)}
                >
                  <span className="sales-playbook__hall-tab-label">{def.label}</span>
                  <span className="sales-playbook__hall-tab-meta muted">
                    {h.count} · {formatRub(h.amount)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="sales-playbook__hall-sheet-body">
            <SalesStrategyPlaybookClosingsList endings={hallEndings} clubId={clubId} />
          </div>
        </section>
      ) : null}
    </>
  )
}
