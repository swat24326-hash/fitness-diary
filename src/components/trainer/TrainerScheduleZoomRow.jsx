import { ZoomIn, ZoomOut } from 'lucide-react'
import { formatScheduleZoomPercent } from '../../lib/trainer/scheduleZoomCore.js'
import '../../styles/trainer-schedule-zoom.css'

/**
 * Строка «Масштаб» в меню «⋮»: меню не закрывается, чтобы подобрать масштаб в несколько тапов.
 * @param {{ zoom: ReturnType<typeof import('../../hooks/useScheduleZoom.js').useScheduleZoom> }} props
 */
export function TrainerScheduleZoomRow({ zoom }) {
  return (
    <div className="trainer-schedule-zoom" role="group" aria-label="Масштаб сетки">
      <button
        type="button"
        className="trainer-schedule-zoom__btn"
        onClick={zoom.zoomOut}
        disabled={!zoom.canZoomOut}
        aria-label="Мельче: больше часов на экране"
        title="Мельче"
      >
        <ZoomOut size={18} aria-hidden />
      </button>
      <button
        type="button"
        className="trainer-schedule-zoom__value"
        onClick={zoom.reset}
        title="Вернуть обычный масштаб"
        aria-label={`Масштаб ${formatScheduleZoomPercent(zoom.zoom, zoom.base)}, вернуть обычный`}
      >
        {formatScheduleZoomPercent(zoom.zoom, zoom.base)}
      </button>
      <button
        type="button"
        className="trainer-schedule-zoom__btn"
        onClick={zoom.zoomIn}
        disabled={!zoom.canZoomIn}
        aria-label="Крупнее: меньше часов на экране"
        title="Крупнее"
      >
        <ZoomIn size={18} aria-hidden />
      </button>
    </div>
  )
}
