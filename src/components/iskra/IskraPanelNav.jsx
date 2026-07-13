import { ChevronLeft, ChevronRight, Volume2 } from 'lucide-react'
import { GEMINI_MONTH_NAMES, shiftMonth } from '../../lib/admin/geminiMonthNav.js'
import { iskraAdvisorFullAccess } from '../../lib/admin/iskraAdvisorRoles.js'

/**
 * @param {{
 *   segment: 'sales' | 'trainer',
 *   onSegmentChange: (seg: 'sales' | 'trainer') => void,
 *   year: number,
 *   month: number,
 *   onYearMonthChange: (y: number, m: number) => void,
 *   trainers?: Array<{ trainer_id: string, trainer_name?: string }>,
 *   trainerId?: string | null,
 *   onTrainerChange?: (id: string | null) => void,
 *   responseDepth?: 'standard' | 'deep',
 *   onResponseDepthChange?: (depth: 'standard' | 'deep') => void,
 *   showDepthControls?: boolean,
 *   autoSpeak?: boolean,
 *   onAutoSpeakToggle?: () => void,
 *   disabled?: boolean,
 * }} props
 */
export function IskraPanelNav({
  segment,
  onSegmentChange,
  year,
  month,
  onYearMonthChange,
  trainers = [],
  trainerId = null,
  onTrainerChange,
  responseDepth = 'standard',
  onResponseDepthChange,
  showDepthControls = false,
  autoSpeak = false,
  onAutoSpeakToggle,
  disabled = false,
}) {
  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)

  return (
    <nav className="iskra-panel-nav" aria-label="Навигация ИСКРЫ">
      <div className="iskra-panel-nav__segments" role="tablist" aria-label="Контур данных">
        <button
          type="button"
          role="tab"
          aria-selected={segment === 'sales'}
          className={`iskra-panel-nav__seg${segment === 'sales' ? ' iskra-panel-nav__seg--on' : ''}`}
          disabled={disabled}
          onClick={() => onSegmentChange('sales')}
        >
          Продажи
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={segment === 'trainer'}
          className={`iskra-panel-nav__seg${segment === 'trainer' ? ' iskra-panel-nav__seg--on' : ''}`}
          disabled={disabled}
          onClick={() => onSegmentChange('trainer')}
        >
          Тренеры
        </button>
      </div>

      <div className="iskra-panel-nav__row">
        <div className="iskra-panel-nav__month">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label="Предыдущий месяц"
            disabled={disabled}
            onClick={() => onYearMonthChange(prev.year, prev.month)}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="iskra-panel-nav__month-label">
            {GEMINI_MONTH_NAMES[(month || 1) - 1]} {year}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label="Следующий месяц"
            disabled={disabled}
            onClick={() => onYearMonthChange(next.year, next.month)}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {showDepthControls && iskraAdvisorFullAccess && onResponseDepthChange ? (
          <div className="iskra-panel-nav__depth" role="group" aria-label="Глубина ответа">
            <button
              type="button"
              className={`iskra-panel-nav__depth-btn${responseDepth === 'standard' ? ' iskra-panel-nav__depth-btn--on' : ''}`}
              aria-pressed={responseDepth === 'standard'}
              disabled={disabled}
              title="Обычные ответы"
              onClick={() => onResponseDepthChange('standard')}
            >
              Стандарт
            </button>
            <button
              type="button"
              className={`iskra-panel-nav__depth-btn${responseDepth === 'deep' ? ' iskra-panel-nav__depth-btn--on' : ''}`}
              aria-pressed={responseDepth === 'deep'}
              disabled={disabled}
              title="Развёрнутый анализ"
              onClick={() => onResponseDepthChange('deep')}
            >
              Подробно
            </button>
          </div>
        ) : null}

        {onAutoSpeakToggle ? (
          <button
            type="button"
            className={`iskra-panel-nav__speak${autoSpeak ? ' iskra-panel-nav__speak--on' : ''}`}
            aria-pressed={autoSpeak}
            aria-label={autoSpeak ? 'Автоозвучка включена' : 'Автоозвучка выключена'}
            disabled={disabled}
            onClick={onAutoSpeakToggle}
          >
            <Volume2 size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      {segment === 'trainer' && trainers.length > 0 && onTrainerChange ? (
        <div className="iskra-panel-nav__trainer">
          <label className="iskra-panel-nav__trainer-label" htmlFor="iskra-panel-trainer">
            Тренер
          </label>
          <select
            id="iskra-panel-trainer"
            className="select iskra-panel-nav__trainer-select"
            value={trainerId ?? ''}
            disabled={disabled}
            onChange={(e) => onTrainerChange(e.target.value || null)}
          >
            <option value="">Весь клуб (планшеты)</option>
            {trainers.map((t) => (
              <option key={t.trainer_id} value={t.trainer_id}>
                {t.trainer_name || t.trainer_id}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </nav>
  )
}
