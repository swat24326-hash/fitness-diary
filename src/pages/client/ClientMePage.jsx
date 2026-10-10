import { QrCode, RefreshCw, WifiOff } from 'lucide-react'
import { formatDateTimeRu } from '../../lib/dateRu.js'
import { clientMeLeadCard } from '../../lib/client/clientMeHighlightsCore.js'
import { ClientInboxButton } from './ClientInboxButton.jsx'
import { ClientMenu } from './ClientMenu.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import {
  ClientLoyaltyCard,
  ClientMembershipNote,
  ClientMembershipsCard,
  ClientNextSessionCard,
  ClientProgressCard,
} from './ClientMeSections.jsx'
import { ClientOnboardingBanner } from './ClientOnboardingBanner.jsx'
import { useClientMe } from './useClientMe.js'
import { useSparkRebuild } from './useSparkRebuild.js'

/** /me — приложение клиента: данные клуба; установка и напоминания — баннеры первого входа и меню. */
export function ClientMePage() {
  const { data, savedAt, status, error, reload, logout } = useClientMe()
  const spark = useSparkRebuild(status, reload)

  if (status === 'signed_out') {
    return (
      <ClientMeShell>
        <ClientMeStatus
          icon={QrCode}
          title="Вход по ссылке из клуба"
          hint={error || 'Попросите тренера или администратора показать QR-код в вашей карточке и отсканируйте его камерой.'}
        />
      </ClientMeShell>
    )
  }

  const actions = (
    <span className="client-me__actions">
      <button
        type="button"
        className="btn btn-ghost btn-icon-square btn-touch"
        onClick={spark.refresh}
        disabled={status === 'loading'}
        title="Обновить"
        aria-label="Обновить"
      >
        <RefreshCw size={18} aria-hidden className={status === 'loading' ? 'client-me-spin' : undefined} />
      </button>
      <ClientInboxButton count={(Number(data?.inbox_attention) || 0) + (Number(data?.chat_attention) || 0)} />
      <ClientMenu clientName={data?.client?.name || ''} onLogout={() => void logout()} />
    </span>
  )

  if (!data) {
    return (
      <ClientMeShell actions={actions}>
        {status === 'offline' ? (
          <ClientMeStatus icon={WifiOff} title="Нет связи" hint={error} />
        ) : (
          <ClientMeStatus icon={RefreshCw} spin title="Загружаем…" />
        )}
      </ClientMeShell>
    )
  }

  const today = data.as_of
  const sessionFirst = clientMeLeadCard(data) === 'session'
  return (
    <ClientMeShell actions={actions} club={data.club}>
      <h1 className="sr-only">{data.client?.name || 'Мои тренировки'}</h1>
      {status === 'offline' ? (
        <p className="client-me-offline" role="status">
          Нет связи — показаны данные на {savedAt ? formatDateTimeRu(savedAt) : 'последнее обновление'}
        </p>
      ) : null}
      <ClientOnboardingBanner clubName={data.club?.name || ''} />
      <ClientProgressCard
        progress={data.progress}
        sparkBuild={spark.build}
        sparkSettling={spark.settling}
      />
      <div className="client-me-tiles">
        {sessionFirst ? <ClientNextSessionCard session={data.next_session} today={today} lead /> : null}
        <ClientMembershipsCard memberships={data.memberships} today={today} lead={!sessionFirst} />
        {sessionFirst ? null : <ClientNextSessionCard session={data.next_session} today={today} />}
      </div>
      <ClientMembershipNote memberships={data.memberships} />
      <ClientLoyaltyCard loyalty={data.loyalty} />
    </ClientMeShell>
  )
}
