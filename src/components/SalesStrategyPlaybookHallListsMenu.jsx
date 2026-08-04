import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { formatRub } from '../lib/admin/salesReportCore.js'
import {
  filterPlaybookClosingsByHall,
  flattenPlaybookEndings,
  PLAYBOOK_HALL_LIST_TITLES,
  summarizePlaybookClosingsByHall,
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

  useEffect(() => {
    if (!menuOpen) return undefined
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setActiveHall(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const openHall = (hall) => {
    setActiveHall(hall)
    setMenuOpen(false)
  }

  const closePanel = () => setActiveHall(null)

  return (
    <div className="sales-playbook__hall-menu" ref={rootRef}>
      <button
        type="button"
        className="sales-playbook__burger btn btn-secondary btn-icon-square btn-touch"
        aria-label="Списки закрытий по залам"
        aria-expanded={menuOpen}
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
              className="sales-playbook__burger-item"
              onClick={() => openHall(h.hall)}
            >
              <span className="sales-playbook__burger-item-title">
                {PLAYBOOK_HALL_LIST_TITLES[h.hall]}
              </span>
              <span className="sales-playbook__burger-item-meta muted">
                {h.openCount} откр.
                {h.count > h.openCount ? ` · ${h.count - h.openCount} ✓` : ''}
                {h.amount > 0 ? ` · ${formatRub(h.amount)}` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {activeHall ? (
        <div
          className="sales-playbook__hall-list"
          role="region"
          aria-label={PLAYBOOK_HALL_LIST_TITLES[activeHall]}
        >
          <header className="sales-playbook__hall-list-head">
            <div>
              <h4 className="sales-playbook__hall-list-title">
                {PLAYBOOK_HALL_LIST_TITLES[activeHall]}
              </h4>
              <p className="muted sales-playbook__hall-list-sub">
                {hallEndings.length} в списке · по дате окончания абона
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon-square btn-touch"
              aria-label="Закрыть список"
              onClick={closePanel}
            >
              <X size={18} aria-hidden />
            </button>
          </header>
          <SalesStrategyPlaybookClosingsList endings={hallEndings} clubId={clubId} />
        </div>
      ) : null}
    </div>
  )
}
