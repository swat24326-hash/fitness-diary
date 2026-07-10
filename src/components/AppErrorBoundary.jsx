import { Component } from 'react'
import { recordAppError } from '../lib/appErrorJournal.js'

/**
 * Ловит падения React-дерева — планшет не уходит в белый экран без подсказки.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    recordAppError({
      source: 'app',
      error: error?.message ? String(error.message) : String(error),
      context: String(info?.componentStack ?? '').slice(0, 300),
    })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error-fallback" role="alert">
          <h2 className="app-error-fallback__title">Что-то пошло не так</h2>
          <p className="app-error-fallback__text">
            Перезагрузите страницу. Если повторится — откройте «Диагностика» в меню или отправьте отчёт
            администратору.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
