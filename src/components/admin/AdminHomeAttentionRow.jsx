import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminHomeSalesPlanGlance } from './AdminHomeSalesPlanGlance.jsx'
import { AdminPlanerkaHomeGlance } from './AdminPlanerkaHomeGlance.jsx'
import { AdminHomeSoftSignalGlance } from './AdminHomeSoftSignalGlance.jsx'
import { ManagerPnkHomeGlance } from '../pnk/ManagerPnkHomeGlance.jsx'
import { assignAttentionSoftSlots } from '../../lib/admin/adminHomeSoftSignalsCore.js'
import {
  peekAttentionPresenceSession,
  writeAttentionPresenceSession,
} from '../../lib/admin/attentionPresenceSession.js'
import '../../styles/admin-path.css'

/**
 * Верхний ряд главной: план + ПНК / планёрка / мягкие сигналы.
 * Presence из session — слоты не прыгают с false→true после первого fetch.
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
  const cid = String(clubId || '').trim()
  const cachedPresence = cid ? peekAttentionPresenceSession(cid) : null

  const [hasPnk, setHasPnk] = useState(() => Boolean(cachedPresence?.hasPnk))
  const [hasPlanerka, setHasPlanerka] = useState(() => Boolean(cachedPresence?.hasPlanerka))

  const onPnkPresence = useCallback((visible) => {
    setHasPnk(Boolean(visible))
  }, [])

  const onPlanerkaPresence = useCallback((visible) => {
    setHasPlanerka(Boolean(visible))
  }, [])

  useEffect(() => {
    if (!cid) return
    writeAttentionPresenceSession(cid, { hasPnk, hasPlanerka })
  }, [cid, hasPnk, hasPlanerka])

  const { softForPnk, softForPlanerka } = useMemo(
    () => assignAttentionSoftSlots(softSignals, { hasPnk, hasPlanerka }),
    [softSignals, hasPnk, hasPlanerka],
  )

  const primarySides = (hasPnk ? 1 : 0) + (hasPlanerka ? 1 : 0)
  const softCount = (softForPnk ? 1 : 0) + (softForPlanerka ? 1 : 0)
  const sideCount = primarySides + softCount
  const compact = sideCount > 0

  useEffect(() => {
    onWidgetsPresence?.({ hasPnk, hasPlanerka, sideCount })
  }, [hasPnk, hasPlanerka, sideCount, onWidgetsPresence])

  if (!cid) return null

  const pnkSlotFilled = hasPnk || Boolean(softForPnk)
  const planerkaSlotFilled = hasPlanerka || Boolean(softForPlanerka)

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
          expectVisible={hasPnk}
          onPresenceChange={onPnkPresence}
        />
        {softForPnk ? (
          <AdminHomeSoftSignalGlance
            id={softForPnk.id}
            title={softForPnk.title}
            subtitle={softForPnk.subtitle}
            href={softForPnk.href}
            tone={softForPnk.tone}
            scorePct={softForPnk.scorePct}
            chipLabel={softForPnk.chipLabel}
            reviewCount={softForPnk.reviewCount}
            attentionCount={softForPnk.attentionCount}
            droppedCount={softForPnk.droppedCount}
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
          expectVisible={hasPlanerka}
          onPresenceChange={onPlanerkaPresence}
        />
        {softForPlanerka ? (
          <AdminHomeSoftSignalGlance
            id={softForPlanerka.id}
            title={softForPlanerka.title}
            subtitle={softForPlanerka.subtitle}
            href={softForPlanerka.href}
            tone={softForPlanerka.tone}
            scorePct={softForPlanerka.scorePct}
            chipLabel={softForPlanerka.chipLabel}
            reviewCount={softForPlanerka.reviewCount}
            attentionCount={softForPlanerka.attentionCount}
            droppedCount={softForPlanerka.droppedCount}
            compact={compact}
          />
        ) : null}
      </div>
    </section>
  )
}
