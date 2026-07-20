import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminHomeSalesPlanGlance } from './AdminHomeSalesPlanGlance.jsx'
import { AdminPlanerkaHomeGlance } from './AdminPlanerkaHomeGlance.jsx'
import { AdminHomeSoftSignalGlance } from './AdminHomeSoftSignalGlance.jsx'
import { ManagerPnkHomeGlance } from '../pnk/ManagerPnkHomeGlance.jsx'
import { pickSoftSignalsForSlots } from '../../lib/admin/adminHomeSoftSignalsCore.js'
import '../../styles/admin-path.css'

/**
 * Верхний ряд главной: план + ПНК / планёрка / мягкие сигналы.
 * Админ и менеджер — один каркас; план через renderPlan.
 *
 * @param {{
 *   clubId: string,
 *   hrefPnk?: string,
 *   hrefPlanerka?: string,
 *   renderPlan?: (opts: { compact: boolean, clubId: string }) => import('react').ReactNode,
 *   softSignals?: Array<{ id: string, title: string, subtitle?: string, href: string, tone?: string }>,
 *   onWidgetsPresence?: (info: { hasPnk: boolean, hasPlanerka: boolean, sideCount: number }) => void,
 * }} props
 */
export function AdminHomeAttentionRow({
  clubId = '',
  hrefPnk = '/admin/pnk',
  hrefPlanerka = '/admin/club-tasks',
  renderPlan,
  softSignals = [],
  onWidgetsPresence,
}) {
  const [hasPnk, setHasPnk] = useState(false)
  const [hasPlanerka, setHasPlanerka] = useState(false)

  const onPnkPresence = useCallback((visible) => {
    setHasPnk(Boolean(visible))
  }, [])

  const onPlanerkaPresence = useCallback((visible) => {
    setHasPlanerka(Boolean(visible))
  }, [])

  const primarySides = (hasPnk ? 1 : 0) + (hasPlanerka ? 1 : 0)
  const softShown = useMemo(
    () => pickSoftSignalsForSlots(softSignals, { primarySides, maxSides: 2 }),
    [softSignals, primarySides],
  )

  const sideCount = primarySides + softShown.length
  const compact = sideCount > 0

  useEffect(() => {
    onWidgetsPresence?.({ hasPnk, hasPlanerka, sideCount })
  }, [hasPnk, hasPlanerka, sideCount, onWidgetsPresence])

  const cid = String(clubId || '').trim()
  if (!cid) return null

  let softCursor = 0
  const softForPnkSlot = !hasPnk && softShown[softCursor] ? softShown[softCursor++] : null
  const softForPlanerkaSlot = !hasPlanerka && softShown[softCursor] ? softShown[softCursor++] : null

  const pnkSlotFilled = hasPnk || Boolean(softForPnkSlot)
  const planerkaSlotFilled = hasPlanerka || Boolean(softForPlanerkaSlot)

  return (
    <section
      className={`admin-home-attention admin-home-attention--sides-${sideCount}`}
      aria-label="План, ПНК и планёрка"
    >
      <div className="admin-home-attention__plan">
        {typeof renderPlan === 'function' ? (
          renderPlan({ compact, clubId: cid })
        ) : (
          <AdminHomeSalesPlanGlance clubId={cid} compact={compact} />
        )}
      </div>

      <div
        className={`admin-home-attention__side admin-home-attention__side--pnk${pnkSlotFilled ? '' : ' is-empty'}`}
      >
        <ManagerPnkHomeGlance
          clubId={cid}
          href={hrefPnk}
          compact={compact}
          onPresenceChange={onPnkPresence}
        />
        {softForPnkSlot ? (
          <AdminHomeSoftSignalGlance
            id={softForPnkSlot.id}
            title={softForPnkSlot.title}
            subtitle={softForPnkSlot.subtitle}
            href={softForPnkSlot.href}
            tone={softForPnkSlot.tone}
            scorePct={softForPnkSlot.scorePct}
            chipLabel={softForPnkSlot.chipLabel}
            reviewCount={softForPnkSlot.reviewCount}
            attentionCount={softForPnkSlot.attentionCount}
            droppedCount={softForPnkSlot.droppedCount}
            compact={compact}
          />
        ) : null}
      </div>

      <div
        className={`admin-home-attention__side admin-home-attention__side--planerka${planerkaSlotFilled ? '' : ' is-empty'}`}
      >
        <AdminPlanerkaHomeGlance
          clubId={cid}
          href={hrefPlanerka}
          compact={compact}
          onPresenceChange={onPlanerkaPresence}
        />
        {softForPlanerkaSlot ? (
          <AdminHomeSoftSignalGlance
            id={softForPlanerkaSlot.id}
            title={softForPlanerkaSlot.title}
            subtitle={softForPlanerkaSlot.subtitle}
            href={softForPlanerkaSlot.href}
            tone={softForPlanerkaSlot.tone}
            scorePct={softForPlanerkaSlot.scorePct}
            chipLabel={softForPlanerkaSlot.chipLabel}
            reviewCount={softForPlanerkaSlot.reviewCount}
            attentionCount={softForPlanerkaSlot.attentionCount}
            droppedCount={softForPlanerkaSlot.droppedCount}
            compact={compact}
          />
        ) : null}
      </div>
    </section>
  )
}
