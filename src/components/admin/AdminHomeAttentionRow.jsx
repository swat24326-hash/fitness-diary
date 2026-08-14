import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminHomeSalesPlanGlance } from './AdminHomeSalesPlanGlance.jsx'
import { AdminPlanerkaHomeGlance } from './AdminPlanerkaHomeGlance.jsx'
import { AdminHomeSoftSignalGlance } from './AdminHomeSoftSignalGlance.jsx'
import { ManagerPnkHomeGlance } from '../pnk/ManagerPnkHomeGlance.jsx'
import { SalesCallTodayGlance } from './SalesCallTodayGlance.jsx'
import { assignAttentionSoftSlots } from '../../lib/admin/adminHomeSoftSignalsCore.js'
import {
  attentionSoftOccupancy,
  resolveAttentionSidePlacement,
} from '../../lib/admin/attentionSidePlacementCore.js'
import {
  peekAttentionPresenceSession,
  writeAttentionPresenceSession,
} from '../../lib/admin/attentionPresenceSession.js'
import '../../styles/admin-path.css'

/**
 * Верхний ряд главной: план + ПНК / планёрка / «кому звонить» / мягкие сигналы.
 *
 * Договорённости слотов (см. attentionSidePlacementCore):
 * - Планёрка важнее «кому звонить» в правом слоте
 * - Если планёрка заняла право, а ПНК нет — «кому звонить» уходит в левый слот (без дыры)
 * - ПНК + планёрка → «кому звонить» скрыт (сетка 3 колонки не ломается)
 * - Soft только в по-настоящему пустой слот
 *
 * @param {{
 *   clubId: string,
 *   hrefPnk?: string,
 *   hrefPlanerka?: string,
 *   hrefCallJournal?: string,
 *   enableCallToday?: boolean,
 *   renderPlan?: (opts: { compact: boolean, clubId: string }) => import('react').ReactNode,
 *   softSignals?: Array<{ id: string, title: string, subtitle?: string, href: string, tone?: string }>,
 *   onWidgetsPresence?: (info: {
 *     hasPnk: boolean,
 *     hasPlanerka: boolean,
 *     hasCallToday: boolean,
 *     hasCallTodayQueue: boolean,
 *     sideCount: number,
 *   }) => void,
 * }} props
 */
export function AdminHomeAttentionRow({
  clubId = '',
  hrefPnk = '/admin/pnk',
  hrefPlanerka = '/admin/club-tasks',
  hrefCallJournal = '/sales/call-log',
  enableCallToday = false,
  renderPlan,
  softSignals = [],
  onWidgetsPresence,
}) {
  const cid = String(clubId || '').trim()
  const cachedPresence = cid ? peekAttentionPresenceSession(cid) : null

  const [hasPnk, setHasPnk] = useState(() => Boolean(cachedPresence?.hasPnk))
  const [hasPlanerka, setHasPlanerka] = useState(() => Boolean(cachedPresence?.hasPlanerka))
  const [hasCallToday, setHasCallToday] = useState(() =>
    enableCallToday ? Boolean(cachedPresence?.hasCallToday ?? true) : false,
  )
  const [hasCallTodayQueue, setHasCallTodayQueue] = useState(false)

  const onPnkPresence = useCallback((visible) => {
    setHasPnk(Boolean(visible))
  }, [])

  const onPlanerkaPresence = useCallback((visible) => {
    setHasPlanerka(Boolean(visible))
  }, [])

  const onCallTodayPresence = useCallback((visible) => {
    setHasCallToday(Boolean(visible))
  }, [])

  const onCallTodayQueue = useCallback((hasQueue) => {
    setHasCallTodayQueue(Boolean(hasQueue))
  }, [])

  useEffect(() => {
    if (!enableCallToday) {
      setHasCallToday(false)
      setHasCallTodayQueue(false)
    }
  }, [enableCallToday])

  useEffect(() => {
    if (!cid) return
    writeAttentionPresenceSession(cid, {
      hasPnk,
      hasPlanerka,
      hasCallToday: enableCallToday && hasCallToday,
    })
  }, [cid, hasPnk, hasPlanerka, hasCallToday, enableCallToday])

  const placement = useMemo(
    () =>
      resolveAttentionSidePlacement({
        hasPnk,
        hasPlanerka,
        enableCallToday,
        callTodayReady: hasCallToday,
      }),
    [hasPnk, hasPlanerka, enableCallToday, hasCallToday],
  )

  /** Карточка звонков скрыта — не подсвечивать плитку журнала. */
  useEffect(() => {
    if (!placement.callTodayShown) setHasCallTodayQueue(false)
  }, [placement.callTodayShown])

  const softOcc = useMemo(() => attentionSoftOccupancy(placement), [placement])

  const { softForPnk, softForPlanerka } = useMemo(
    () => assignAttentionSoftSlots(softSignals, softOcc),
    [softSignals, softOcc],
  )

  const pnkShowsCall = placement.pnk === 'callToday'
  const planerkaShowsCall = placement.planerka === 'callToday'
  const pnkShowsPrimary = placement.pnk === 'pnk'
  const planerkaShowsPrimary = placement.planerka === 'planerka'

  const pnkSlotFilled = pnkShowsPrimary || pnkShowsCall || Boolean(softForPnk)
  const planerkaSlotFilled = planerkaShowsPrimary || planerkaShowsCall || Boolean(softForPlanerka)

  const primarySides =
    (pnkShowsPrimary || pnkShowsCall ? 1 : 0) + (planerkaShowsPrimary || planerkaShowsCall ? 1 : 0)
  const softCount = (softForPnk ? 1 : 0) + (softForPlanerka ? 1 : 0)
  const sideCount = primarySides + softCount
  const compact = true

  useEffect(() => {
    onWidgetsPresence?.({
      hasPnk,
      hasPlanerka,
      hasCallToday: enableCallToday && hasCallToday,
      hasCallTodayQueue: enableCallToday && hasCallTodayQueue && placement.callTodayShown,
      sideCount,
    })
  }, [
    hasPnk,
    hasPlanerka,
    hasCallToday,
    hasCallTodayQueue,
    enableCallToday,
    placement.callTodayShown,
    sideCount,
    onWidgetsPresence,
  ])

  if (!cid) return null

  const softPnkCompact = softForPnk?.id === 'coach-quality' ? false : compact
  const softPlanerkaCompact = softForPlanerka?.id === 'coach-quality' ? false : compact

  const callTodayNode = (slot) => (
    <SalesCallTodayGlance
      key={`call-today-${slot}`}
      clubId={cid}
      hrefJournal={hrefCallJournal}
      compact={compact}
      expectVisible={hasCallToday}
      onPresenceChange={onCallTodayPresence}
      onQueueChange={onCallTodayQueue}
    />
  )

  return (
    <section
      className={`admin-home-attention admin-home-attention--stable admin-home-attention--sides-${sideCount}`}
      aria-label="План, ПНК и звонки"
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
        aria-hidden={pnkSlotFilled ? undefined : true}
      >
        <ManagerPnkHomeGlance
          clubId={cid}
          href={hrefPnk}
          compact={compact}
          expectVisible={hasPnk}
          onPresenceChange={onPnkPresence}
        />
        {pnkShowsCall ? callTodayNode('pnk') : null}
        {!pnkShowsPrimary && !pnkShowsCall && softForPnk ? (
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
            compact={softPnkCompact}
          />
        ) : null}
      </div>

      <div
        className={`admin-home-attention__side admin-home-attention__side--planerka${planerkaSlotFilled ? '' : ' is-empty'}`}
        aria-hidden={planerkaSlotFilled ? undefined : true}
      >
        <AdminPlanerkaHomeGlance
          clubId={cid}
          href={hrefPlanerka}
          compact={compact}
          expectVisible={hasPlanerka}
          onPresenceChange={onPlanerkaPresence}
        />
        {planerkaShowsCall ? callTodayNode('planerka') : null}
        {!planerkaShowsPrimary && !planerkaShowsCall && softForPlanerka ? (
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
            compact={softPlanerkaCompact}
          />
        ) : null}
      </div>
    </section>
  )
}
