import { Component } from 'react'
import { recordAppError } from '../lib/appErrorJournal.js'

/**
 * Локальная граница ошибок — сбой в одном разделе не роняет всё приложение.
 */
export class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    const section = String(this.props.section ?? 'section').trim() || 'section'
    recordAppError({
      source: 'app',
      error: error?.message ? String(error.message) : String(error),
      context: `${section}: ${String(info?.componentStack ?? '').slice(0, 240)}`,
    })
  }

  render() {
    if (this.state.error) {
      const title = String(this.props.title ?? 'Раздел временно недоступен').trim()
      return (
        <div className="section-error-fallback" role="alert">
          <h2 className="section-error-fallback__title">{title}</h2>
          <p className="section-error-fallback__text">
            Произошла ошибка отображения. Обновите страницу или перейдите в другой раздел меню.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => this.setState({ error: null })}
          >
            Попробовать снова
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
