import { useMemo } from 'react'
import { ClipboardCheck, Gauge, UserPlus } from 'lucide-react'
import { AdminHomeSalesPlanGlance } from './AdminHomeSalesPlanGlance.jsx'
import { AdminPlanerkaHomeGlance } from './AdminPlanerkaHomeGlance.jsx'
import { AdminHomeSoftSignalGlance } from './AdminHomeSoftSignalGlance.jsx'
import { AdminHomeEmptyGlance } from './AdminHomeEmptyGlance.jsx'
import { ManagerPnkHomeGlance } from '../pnk/ManagerPnkHomeGlance.jsx'
import {
  ADMIN_HOME_GLANCE_EMPTY,
  buildCoachQualityHomeSlot,
} from '../../lib/admin/adminHomeGlanceRowCore.js'
import '../../styles/admin-path.css'

function CoachQualitySlot({ slot }) {
  if (slot.state === 'skeleton') {
    return (
      <section className="trainer-task-glance" aria-busy="true" aria-label="Загрузка качества ведения">
        <div className="admin-home-skel manager-pnk-glance__skel-card" />
      </section>
    )
  }
  if (slot.state === 'empty') {
    return <AdminHomeEmptyGlance href={slot.href} icon={Gauge} {...ADMIN_HOME_GLANCE_EMPTY.coachQuality} />
  }
  const s = slot.signal
  return (
    <AdminHomeSoftSignalGlance
      id={s.id}
      title={s.title}
      subtitle={s.subtitle}
      href={s.href}
      tone={s.tone}
      scorePct={s.scorePct}
      chipLabel={s.chipLabel}
      reviewCount={s.reviewCount}
      attentionCount={s.attentionCount}
      droppedCount={s.droppedCount}
    />
  )
}

/**
 * Главная админа / управляющего: четыре карточки всегда на своих местах.
 * @param {{
 *   clubId: string,
 *   hrefPnk: string,
 *   hrefPlanerka: string,
 *   statsPath: string,
 *   coachQuality?: object | null,
 *   coachQualityLoading?: boolean,
 * }} props
 */
export function AdminHomeGlanceRow({
  clubId = '',
  hrefPnk,
  hrefPlanerka,
  statsPath,
  coachQuality = null,
  coachQualityLoading = false,
}) {
  const cid = String(clubId || '').trim()
  const cqSlot = useMemo(
    () => buildCoachQualityHomeSlot({ coachQuality, loading: coachQualityLoading, clubId: cid, statsPath }),
    [coachQuality, coachQualityLoading, cid, statsPath],
  )

  if (!cid) return null

  return (
    <section
      className="admin-home-attention admin-home-attention--fixed"
      aria-label="Продажи, ПНК, качество ведения и планёрка"
    >
      <div className="admin-home-attention__plan">
        <AdminHomeSalesPlanGlance clubId={cid} compact />
      </div>
      <div className="admin-home-attention__side admin-home-attention__side--pnk">
        <ManagerPnkHomeGlance
          clubId={cid}
          href={hrefPnk}
          compact
          expectVisible
          emptyFallback={<AdminHomeEmptyGlance href={hrefPnk} icon={UserPlus} {...ADMIN_HOME_GLANCE_EMPTY.pnk} />}
        />
      </div>
      <div className="admin-home-attention__side admin-home-attention__side--cq">
        <CoachQualitySlot slot={cqSlot} />
      </div>
      <div className="admin-home-attention__side admin-home-attention__side--planerka">
        <AdminPlanerkaHomeGlance
          clubId={cid}
          href={hrefPlanerka}
          compact
          expectVisible
          emptyFallback={
            <AdminHomeEmptyGlance href={hrefPlanerka} icon={ClipboardCheck} {...ADMIN_HOME_GLANCE_EMPTY.planerka} />
          }
        />
      </div>
    </section>
  )
}
