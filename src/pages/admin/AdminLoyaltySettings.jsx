import { useSearchParams } from 'react-router-dom'
import { LoyaltySettingsSection } from '../../components/loyalty/LoyaltySettingsSection.jsx'
import { useAuth } from '../../context/AuthContext'
import { useLoyaltySettings } from '../../hooks/useLoyaltySettings.js'

/**
 * Структура → Лояльность. Клуб из шапки (`?club=`).
 */
export function AdminLoyaltySettings() {
  const { isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const clubId = searchParams.get('club')?.trim() ?? ''
  const s = useLoyaltySettings(clubId, { isAdmin: isAdmin === true })

  return (
    <LoyaltySettingsSection
      clubId={s.clubId}
      draft={s.draft}
      intervals={s.intervals}
      enabledAt={s.enabledAt}
      migrationNeeded={s.migrationNeeded}
      busy={s.busy}
      error={s.error}
      msg={s.msg}
      saveState={s.saveState}
      patchDraft={s.patchDraft}
      onSave={s.save}
    />
  )
}
