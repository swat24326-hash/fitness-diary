import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, ImageOff, Loader2, RotateCcw } from 'lucide-react'
import { chatAttachExpiredRu, formatAttachSize } from '../../lib/chat/chatAttachCore.js'
import { loadChatAttach, saveChatAttach } from '../../lib/chat/chatAttachCache.js'
import { ChatPhotoViewer } from './ChatPhotoViewer.jsx'
import { ChatVideoBubble } from './ChatVideoBubble.jsx'
import '../../styles/chat-attach.css'

/** Файл качаем, когда пузырь показался на экране (фото выше в истории не тянем зря). */
function useAttachFile(id, load, auto) {
  const ref = useRef(null)
  const [state, setState] = useState({ file: null, status: 'idle', error: '' })
  const fetchFile = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    return loadChatAttach(id, load).then(
      (file) => {
        setState({ file, status: 'ready', error: '' })
        return file
      },
      (e) => {
        setState({ file: null, status: 'error', error: e?.message || 'Не загрузилось' })
        return null
      },
    )
  }, [id, load])
  useEffect(() => {
    const el = ref.current
    if (!auto || !el) return undefined
    if (typeof IntersectionObserver !== 'function') {
      void fetchFile()
      return undefined
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      void fetchFile()
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [auto, fetchFile])
  return { ref, ...state, fetchFile }
}

function Gone({ kind }) {
  return (
    <div className="chat-attach-gone" data-testid="chat-attach-gone">
      {kind === 'photo' || kind === 'sticker' ? <ImageOff size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
      <span>{chatAttachExpiredRu(kind)}</span>
    </div>
  )
}

function PhotoBubble({ id, attach, load }) {
  const f = useAttachFile(id, load, true)
  const [open, setOpen] = useState(false)
  const ratio = attach.w && attach.h ? `${attach.w} / ${attach.h}` : '4 / 3'
  return (
    <>
      <button
        ref={f.ref}
        type="button"
        className="chat-attach-photo"
        style={{ aspectRatio: ratio }}
        aria-label={f.status === 'error' ? 'Загрузить фото ещё раз' : 'Открыть фото'}
        data-testid="chat-attach-photo"
        onClick={() => (f.status === 'error' ? void f.fetchFile() : f.file && setOpen(true))}
      >
        {f.file ? <img src={f.file.url} alt="Фото" draggable={false} /> : null}
        {f.status === 'loading' || f.status === 'idle' ? <Loader2 size={22} className="chat-attach-spin" aria-hidden /> : null}
        {f.status === 'error' ? (
          <span className="chat-attach-photo__error">
            <RotateCcw size={18} aria-hidden />
            {f.error}
          </span>
        ) : null}
      </button>
      {open && f.file ? <ChatPhotoViewer url={f.file.url} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

/** Стикер с клавиатуры: картинка без рамки и фона, как наши стикеры; на весь экран не открываем. */
function StickerBubble({ id, attach, load }) {
  const f = useAttachFile(id, load, true)
  return (
    <span
      ref={f.ref}
      className="chat-attach-sticker"
      style={{ aspectRatio: attach.w && attach.h ? `${attach.w} / ${attach.h}` : '1 / 1' }}
      data-testid="chat-attach-sticker"
    >
      {f.file ? <img src={f.file.url} alt="Стикер" draggable={false} /> : null}
      {f.status === 'loading' || f.status === 'idle' ? <Loader2 size={22} className="chat-attach-spin" aria-hidden /> : null}
      {f.status === 'error' ? (
        <button type="button" className="chat-attach-photo__error" onClick={() => void f.fetchFile()}>
          <RotateCcw size={18} aria-hidden />
          {f.error}
        </button>
      ) : null}
    </span>
  )
}

function FileBubble({ id, attach, load }) {
  const f = useAttachFile(id, load, false)
  const busy = f.status === 'loading'
  const open = async () => {
    const file = f.file ?? (await f.fetchFile())
    if (file) saveChatAttach(file.url, attach.name || 'Документ.pdf')
  }
  return (
    <button ref={f.ref} type="button" className="chat-attach-file" data-testid="chat-attach-file" disabled={busy} onClick={() => void open()} title="Скачать">
      <span className="chat-attach-file__icon">{busy ? <Loader2 size={20} className="chat-attach-spin" aria-hidden /> : <FileText size={20} aria-hidden />}</span>
      <span className="chat-attach-file__text">
        <strong>{attach.name || 'Документ.pdf'}</strong>
        <span>{f.status === 'error' ? f.error : `${formatAttachSize(attach.bytes)} · PDF`}</span>
      </span>
      <Download size={18} className="chat-attach-file__save" aria-hidden />
    </button>
  )
}

/**
 * Вложение в пузыре: фото (тап — на весь экран), плашка PDF (тап — скачать), видеокружок или стикер. Через сутки — «удалено»
 * (стикер — нет).
 * @param {{ id: string, attach: { kind: 'photo'|'file'|'sticker', name: string|null, bytes: number, w: number|null, h: number|null, expired: boolean },
 *   load: (id: string) => Promise<{ data: string, mime: string, name?: string|null }> }} props
 */
export function ChatAttachBubble({ id, attach, load }) {
  if (attach.kind === 'video') return <ChatVideoBubble id={id} attach={attach} load={load} />
  if (attach.expired) return <Gone kind={attach.kind} />
  if (attach.kind === 'sticker') return <StickerBubble id={id} attach={attach} load={load} />
  return attach.kind === 'photo' ? <PhotoBubble id={id} attach={attach} load={load} /> : <FileBubble id={id} attach={attach} load={load} />
}
