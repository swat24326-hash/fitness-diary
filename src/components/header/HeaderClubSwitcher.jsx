import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Building2, Check, ChevronDown, Search, X } from 'lucide-react'
import { OsMark } from '../brand/OsMark.jsx'
import { PRODUCT_BRAND_NAME, productBrandAriaOnline } from '../../lib/productBrand.js'

const SEARCH_FROM = 7

function BrandMark({ online }) {
  return (
    <span className={`app-brand-mark app-brand-mark--micro ${online ? 'app-brand-mark--online' : 'app-brand-mark--offline'}`} aria-hidden>
      <OsMark size={18} className="app-brand-mark__svg" />
    </span>
  )
}

/**
 * Клуб в шапке. Можно переключать — кнопка с названием и стрелкой: на мониторе панель под ней,
 * на телефоне шторка снизу. Нельзя (один клуб, мессенджер) — ссылка на главную клуба.
 * Панель — в .app-shell (цвета роли), не в шапку: container-type шапки держит position:fixed внутри себя.
 */
export function HeaderClubSwitcher({ title, clubs, clubId, online, switchable, homeTo, homeTitle, onSelect }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const panelId = useId()

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? clubs.filter((c) => String(c.name ?? '').toLowerCase().includes(q)) : clubs
  }, [clubs, query])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const el = triggerRef.current
      const r = el?.getBoundingClientRect()
      if (r) {
        setPos({
          top: Math.round(r.bottom + 8),
          left: Math.round(Math.max(8, r.left)),
          host: el.closest('.app-shell') ?? document.body,
        })
      }
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  const ready = open && pos !== null
  useEffect(() => {
    if (!ready) return
    const panel = panelRef.current
    const first = panel?.querySelector('input') || panel?.querySelector('[aria-current="true"]') || panel?.querySelector('button')
    first?.focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      setPos(null)
      setQuery('')
      triggerRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready])

  if (!switchable) {
    return (
      <Link
        to={homeTo}
        className="app-brand app-brand--club-hero u-no-decoration"
        style={{ color: 'inherit' }}
        title={homeTitle || `${PRODUCT_BRAND_NAME} · ${online ? 'онлайн' : 'офлайн'}`}
        aria-label={`${title}. ${productBrandAriaOnline(online)}`}
      >
        <BrandMark online={online} />
        <span className="app-brand-club">{title}</span>
      </Link>
    )
  }

  const close = () => {
    setOpen(false)
    setPos(null)
    setQuery('')
  }
  const pick = (id) => {
    close()
    if (String(id) !== String(clubId)) onSelect(id)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`app-brand app-brand--club-hero club-switch__trigger${open ? ' club-switch__trigger--open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Сменить клуб"
        aria-label={`Клуб: ${title}. Сменить клуб. ${productBrandAriaOnline(online)}`}
        data-testid="header-club-switch"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <BrandMark online={online} />
        <span className="app-brand-club">{title}</span>
        <ChevronDown size={16} aria-hidden className="club-switch__chevron" />
      </button>
      {ready
        ? createPortal(
            <>
              <div className="club-switch__backdrop" onClick={close} aria-hidden />
              <div
                ref={panelRef}
                id={panelId}
                className="club-switch__panel"
                role="dialog"
                aria-label="Выбор клуба"
                style={{ '--club-switch-top': `${pos.top}px`, '--club-switch-left': `${pos.left}px` }}
              >
                <div className="club-switch__head">
                  <span className="club-switch__title">Клуб</span>
                  <span className="club-switch__count">{clubs.length}</span>
                  <button type="button" className="btn btn-ghost club-switch__close" onClick={close} aria-label="Закрыть" title="Закрыть">
                    <X size={18} aria-hidden />
                  </button>
                </div>
                {clubs.length >= SEARCH_FROM ? (
                  <label className="club-switch__search">
                    <Search size={16} aria-hidden />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Найти клуб"
                      aria-label="Найти клуб"
                    />
                  </label>
                ) : null}
                <div className="club-switch__list" role="list">
                  {shown.map((c) => {
                    const active = String(c.id) === String(clubId)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="listitem"
                        className={`club-switch__item${active ? ' club-switch__item--active' : ''}`}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => pick(c.id)}
                      >
                        <Building2 size={18} aria-hidden className="club-switch__item-icon" />
                        <span className="club-switch__item-name">{c.name || c.id}</span>
                        {active ? <Check size={18} aria-hidden className="club-switch__item-check" /> : null}
                      </button>
                    )
                  })}
                  {shown.length === 0 ? <p className="club-switch__empty">Клуб не найден</p> : null}
                </div>
              </div>
            </>,
            pos.host,
          )
        : null}
    </>
  )
}
