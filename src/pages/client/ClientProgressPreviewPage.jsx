/**
 * DEV: вся главная /me с примером (без логина).
 * /me/home-preview и /me/progress-preview — одно и то же.
 * /me/home-preview?az=1 — чистый АЗ: «Следующая» = группа, без «От тренера» / бонусов.
 * /me/home-preview?mixed=1 — ПЗ+АЗ: метка зала, срочный абон, бонусы.
 */
import { useCallback, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { MoreVertical, Ruler, Scale } from 'lucide-react'
import { clientMeLeadCard } from '../../lib/client/clientMeHighlightsCore.js'
import {
  clientMeHomeAzPreviewSample,
  clientMeHomeMixedPreviewSample,
  clientMeHomePreviewSample,
} from '../../lib/client/clientMeProgressPreviewSample.js'
import { ClientMeShell } from './ClientMeShell.jsx'
import {
  ClientLoyaltyCard,
  ClientMembershipNote,
  ClientMembershipsCard,
  ClientNextSessionCard,
  ClientStatsCard,
} from './ClientMeSections.jsx'
import { ClientProgressSection } from './ClientProgressSection.jsx'

function previewSample(pureAz, mixed) {
  if (pureAz) return clientMeHomeAzPreviewSample()
  if (mixed) return clientMeHomeMixedPreviewSample()
  return clientMeHomePreviewSample()
}

function PreviewProgressMenu({ onAddWeight, onAddMeasure }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="client-menu" style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch"
        aria-label="Меню"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={22} aria-hidden />
      </button>
      {open ? (
        <div className="app-header__dropdown" role="region" aria-label="Меню">
          <button
            type="button"
            className="app-header__menu-item"
            onClick={() => {
              setOpen(false)
              onAddWeight()
            }}
          >
            <Scale size={18} aria-hidden />
            Добавить вес
          </button>
          <button
            type="button"
            className="app-header__menu-item"
            onClick={() => {
              setOpen(false)
              onAddMeasure()
            }}
          >
            <Ruler size={18} aria-hidden />
            Добавить обмеры
          </button>
        </div>
      ) : null}
    </span>
  )
}

function ClientHomePreviewBody({ initial, note, showFromTrainer }) {
  const [data, setData] = useState(initial)
  const [addRequest, setAddRequest] = useState(/** @type {null | 'weight' | 'measure'} */ (null))
  const consumeAdd = useCallback(() => setAddRequest(null), [])
  const today = data.as_of
  const sessionFirst = clientMeLeadCard(data) === 'session'
  return (
    <ClientMeShell
      club={data.club}
      tabs
      showFromTrainer={showFromTrainer}
      actions={
        <PreviewProgressMenu
          onAddWeight={() => setAddRequest('weight')}
          onAddMeasure={() => setAddRequest('measure')}
        />
      }
    >
      <p className="client-me-offline" role="note">
        {note}
      </p>
      <p className="client-me__hello">{data.client.name}</p>
      <ClientProgressSection
        progress={data.progress}
        asOf={today}
        localOnly
        addRequest={addRequest}
        onAddRequestConsumed={consumeAdd}
        onProgressSaved={(progress) => setData((d) => ({ ...d, progress }))}
      />
      <ClientStatsCard progress={data.progress} />
      <div className="client-me-tiles">
        {sessionFirst ? <ClientNextSessionCard session={data.next_session} today={today} lead /> : null}
        <ClientMembershipsCard memberships={data.memberships} today={today} lead={!sessionFirst} />
        {sessionFirst ? null : <ClientNextSessionCard session={data.next_session} today={today} />}
      </div>
      <ClientMembershipNote memberships={data.memberships} />
      <ClientLoyaltyCard loyalty={data.loyalty} memberships={data.memberships} />
    </ClientMeShell>
  )
}

export function ClientProgressPreviewPage() {
  const [params] = useSearchParams()
  const pureAz = params.get('az') === '1'
  const mixed = params.get('mixed') === '1'
  if (!import.meta.env.DEV) return <Navigate to="/me" replace />
  const initial = previewSample(pureAz, mixed)
  const note = pureAz
    ? 'Превью главной · чистый АЗ · «Следующая» = группа · макет'
    : mixed
      ? 'Превью главной · ПЗ+АЗ · главный абон по срочности · макет'
      : 'Превью главной · только локально · без логина · вес ○ — меню ⋮'
  return (
    <ClientHomePreviewBody
      key={`${pureAz ? 'az' : mixed ? 'mixed' : 'pz'}`}
      initial={initial}
      note={note}
      showFromTrainer={!pureAz}
    />
  )
}

export function ClientHomePreviewPage() {
  return <ClientProgressPreviewPage />
}
