/**
 * Manifest приложения тренера на телефоне под клуб: значок называется как клуб, как у приложения клиента.
 * Браузер берёт manifest без пропуска — в ответе только название клуба и наши иконки.
 * iPhone manifest не читает: название значка — apple-mobile-web-app-title (useClientBranding).
 */
import { APP_BRAND_COACH_TITLE, appBrandManifestIcons } from '../../../src/lib/appBrand.js'
import { cleanClubName, isClientManifestClubId } from '../clientPortal/clientManifestCore.js'

export const COACH_APP_FALLBACK_NAME = APP_BRAND_COACH_TITLE

/** @returns {string | null} null — id не похож на клуб. */
export function coachManifestUrl(clubId) {
  const id = String(clubId ?? '').trim()
  return isClientManifestClubId(id) ? `/api/coach?manifest=${id}` : null
}

export function buildCoachManifest(clubName) {
  const name = cleanClubName(clubName) || COACH_APP_FALLBACK_NAME
  return {
    name,
    short_name: name,
    description: 'Сообщения клиентов и расписание тренера на телефоне',
    id: '/coach/',
    start_url: '/coach',
    scope: '/coach',
    display: 'standalone',
    theme_color: '#0a0a0a',
    background_color: '#0a0a0a',
    orientation: 'portrait',
    icons: appBrandManifestIcons(),
  }
}

/** Клуб тренера для телефона: название для значка и адрес manifest. */
export function buildCoachClub(clubId, clubName) {
  const manifestUrl = coachManifestUrl(clubId)
  const name = cleanClubName(clubName)
  return manifestUrl && name ? { name, manifest_url: manifestUrl } : null
}
