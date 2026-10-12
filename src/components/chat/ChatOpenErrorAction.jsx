import { Link } from 'react-router-dom'
import { chatErrorRetryable } from '../../lib/chat/chatUiCore.js'

/** Диалог не открылся: сеть / сервер — «Повторить»; нет доступа или диалога — «К диалогам». */
export function ChatOpenErrorAction({ errorStatus, onRetry, backTo }) {
  if (!chatErrorRetryable(errorStatus)) {
    return (
      <Link to={backTo} className="btn btn-secondary btn-touch">
        К диалогам
      </Link>
    )
  }
  return (
    <button type="button" className="btn btn-secondary btn-touch" onClick={onRetry}>
      Повторить
    </button>
  )
}
