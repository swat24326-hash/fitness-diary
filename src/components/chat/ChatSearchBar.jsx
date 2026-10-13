import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { CHAT_SEARCH_EMPTY_RU } from '../../lib/chat/chatSearchCore.js'
import '../../styles/chat-search.css'

function statusText({ status, results, index, error }) {
  if (status === 'error') return error
  if (status === 'loading') return 'Ищу…'
  if (!results) return ''
  return results.length ? `${index + 1} из ${results.length}` : CHAT_SEARCH_EMPTY_RU
}

/**
 * Поиск по переписке на месте поля ввода (как в Telegram на телефоне): строка, «3 из 12», ↑ старее, ↓ новее, ×.
 * Enter — к следующему (более старому) совпадению, Esc — закрыть.
 * above — кнопки над полем («↓ Новые», «↓ к ответу»), как у поля ввода
 * @param {{ finder: ReturnType<typeof import('../../hooks/useChatSearch.js').useChatSearch>, above?: import('react').ReactNode }} props
 */
export function ChatSearchBar({ finder, above = null }) {
  const inputRef = useRef(null)
  useEffect(() => inputRef.current?.focus(), [])

  const total = finder.results?.length ?? 0
  const text = statusText(finder)
  return (
    <form
      className="chat-compose chat-search"
      role="search"
      data-testid="chat-search"
      onSubmit={(e) => {
        e.preventDefault()
        finder.step(true)
      }}
    >
      {above}
      <div className="chat-compose__row">
        <div className="chat-compose__pill chat-search__pill">
          <Search size={18} aria-hidden className="chat-search__icon" />
          <input
            ref={inputRef}
            className="chat-search__input"
            type="search"
            enterKeyHint="search"
            value={finder.query}
            placeholder="Поиск по переписке"
            aria-label="Поиск по переписке"
            data-testid="chat-search-input"
            onChange={(e) => finder.setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && finder.close()}
          />
          {text ? (
            <span className={`chat-search__count${finder.status === 'error' ? ' is-error' : ''}`} aria-live="polite" data-testid="chat-search-count">
              {text}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="chat-search__step"
          aria-label="Раньше найденное"
          title="Раньше"
          disabled={finder.index >= total - 1}
          onClick={() => finder.step(true)}
        >
          <ChevronUp size={20} aria-hidden />
        </button>
        <button
          type="button"
          className="chat-search__step"
          aria-label="Позже найденное"
          title="Позже"
          disabled={!total || finder.index <= 0}
          onClick={() => finder.step(false)}
        >
          <ChevronDown size={20} aria-hidden />
        </button>
        <button type="button" className="chat-search__step" aria-label="Закрыть поиск" title="Закрыть" onClick={finder.close}>
          <X size={20} aria-hidden />
        </button>
      </div>
    </form>
  )
}
