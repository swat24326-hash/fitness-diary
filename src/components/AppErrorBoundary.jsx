import { Component } from 'react'
import { recordAppError } from '../lib/appErrorJournal.js'
import { isViteStaleChunkError, recoverFromStaleViteDeploy } from '../lib/viteChunkReload.js'

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
    if (isViteStaleChunkError(error)) {
      void recoverFromStaleViteDeploy()
    }
  }

  render() {
    if (this.state.error) {
      const stale = isViteStaleChunkError(this.state.error)
      return (
        <div className="app-error-fallback" role="alert">
          <h2 className="app-error-fallback__title">
            {stale ? 'Нужно обновить приложение' : 'Что-то пошло не так'}
          </h2>
          <p className="app-error-fallback__text">
            {stale
              ? 'После выкладки новой версии открыта старая страница. Нажмите «Обновить» — подтянется актуальная сборка.'
              : 'Перезагрузите страницу. Если повторится — откройте «Диагностика» в меню или отправьте отчёт администратору.'}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (stale) void recoverFromStaleViteDeploy()
              else window.location.reload()
            }}
          >
            Обновить страницу
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
