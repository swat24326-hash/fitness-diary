import { Gift, Save } from 'lucide-react'
import { AdminSectionHeader } from '../admin/AdminSectionHeader.jsx'
import {
  formatLoyaltyIntervals,
  formatLoyaltyProgramStatus,
  LOYALTY_SETTINGS_NEED_CLUB,
} from '../../lib/loyalty/loyaltySettingsUiCore.js'
import '../../styles/loyalty.css'

/**
 * Форма ставок и тумблера лояльности ПЗ (логика в хуке / core).
 */
export function LoyaltySettingsSection({
  clubId,
  draft,
  intervals,
  enabledAt,
  migrationNeeded,
  busy,
  error,
  msg,
  saveState,
  patchDraft,
  onSave,
}) {
  if (!clubId) {
    return (
      <section className="loyalty-settings">
        <AdminSectionHeader
          title="Лояльность ПЗ"
          lead="Баллы за персоналки: включение по клубу и ставки цикла."
          icon={Gift}
        />
        <p className="muted">{LOYALTY_SETTINGS_NEED_CLUB}</p>
      </section>
    )
  }

  const status = formatLoyaltyProgramStatus({ enabled: draft.enabled, enabled_at: enabledAt })

  return (
    <section className="loyalty-settings" aria-labelledby="loyalty-settings-title">
      <AdminSectionHeader
        title="Лояльность ПЗ"
        lead="Включение и ставки выбранного клуба. Цикл клиента считается на сервере; очередь Sync не трогаем."
        icon={Gift}
      >
        <button
          type="button"
          className="btn btn-primary btn-touch"
          disabled={!saveState.canSave}
          onClick={() => void onSave?.()}
        >
          <Save size={16} aria-hidden />
          Сохранить
        </button>
      </AdminSectionHeader>

      {migrationNeeded ? (
        <p className="admin-section__banner admin-section__banner--warn" role="status">
          Таблиц лояльности в базе ещё нет. После миграции{' '}
          <code>npm run db:migrate:loyalty -- --linked</code> сохранение заработает. Сейчас все копилки idle.
        </p>
      ) : null}
      {saveState.reason && !saveState.canSave && !migrationNeeded ? (
        <p className="muted loyalty-settings__note">{saveState.reason}</p>
      ) : null}
      {error ? (
        <p className="admin-section__banner admin-section__banner--warn" role="alert">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="admin-section__banner" role="status">
          {msg}
        </p>
      ) : null}

      <div className="loyalty-settings__card">
        <h2 className="loyalty-settings__card-title" id="loyalty-settings-title">
          Программа клуба
        </h2>
        <p className="muted loyalty-settings__card-lead">{status}</p>
        <label className="loyalty-settings__toggle">
          <input
            type="checkbox"
            checked={draft.enabled === true}
            disabled={busy}
            onChange={(e) => patchDraft({ enabled: e.target.checked })}
          />
          <span>Включить набор баллов</span>
        </label>
        <p className="muted loyalty-settings__intervals">Интервалы: {formatLoyaltyIntervals(intervals)}</p>
      </div>

      <div className="loyalty-settings__card">
        <h2 className="loyalty-settings__card-title">Ставки открытого цикла</h2>
        <p className="muted loyalty-settings__card-lead">
          Уже идущий цикл держит снимок ставок. Новые числа — для следующих циклов. Потолок минут и ккал
          действует в момент «Завершить».
        </p>
        <div className="loyalty-settings__fields">
          <label className="field">
            <span className="label">Месяцев до куша</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.cycle_months}
              disabled={busy}
              onChange={(e) => patchDraft({ cycle_months: e.target.value })}
              aria-label="Месяцев до куша"
            />
          </label>
          <label className="field">
            <span className="label">Баллов за неделю</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.points_per_week}
              disabled={busy}
              onChange={(e) => patchDraft({ points_per_week: e.target.value })}
              aria-label="Баллов за неделю"
            />
          </label>
          <label className="field">
            <span className="label">Ккал на пачку</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.kcal_chunk}
              disabled={busy}
              onChange={(e) => patchDraft({ kcal_chunk: e.target.value })}
              aria-label="Ккал на пачку"
            />
          </label>
          <label className="field">
            <span className="label">Баллов за пачку ккал</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.points_per_kcal_chunk}
              disabled={busy}
              onChange={(e) => patchDraft({ points_per_kcal_chunk: e.target.value })}
              aria-label="Баллов за пачку ккал"
            />
          </label>
          <label className="field">
            <span className="label">Макс. минут сессии</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.max_minutes}
              disabled={busy}
              onChange={(e) => patchDraft({ max_minutes: e.target.value })}
              aria-label="Максимум минут сессии"
            />
          </label>
          <label className="field">
            <span className="label">Потолок ккал за тренировку</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={draft.max_kcal_per_training}
              disabled={busy}
              onChange={(e) => patchDraft({ max_kcal_per_training: e.target.value })}
              aria-label="Потолок килокалорий за тренировку"
            />
          </label>
        </div>
      </div>
    </section>
  )
}
