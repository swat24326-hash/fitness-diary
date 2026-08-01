import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { normalizeSalesCardNumber } from '../../lib/admin/salesClientMatchCore.js'
import { parseEveningInboundText, normalizeSaleClipStatus } from '../../lib/admin/saleClipCore.js'
import { matchSaleClipClient } from '../../lib/admin/saleClipService.js'
import { todayLocalIso } from '../../lib/dateRu.js'
import { SalesVisualAlert } from './SalesVisualAlert.jsx'

/**
 * Вечер: только match по карте/телефону (облако). Без create абона.
 * Всё непонятное — крупным текстом на экране (без звука).
 */
export function SalesEveningMatchSection({ clubId }) {
  const [raw, setRaw] = useState('')
  const [card, setCard] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [parseWarn, setParseWarn] = useState('')
  const [result, setResult] = useState(null)
  const parsed = useMemo(() => parseEveningInboundText(raw), [raw])

  const effectiveCard = card || parsed.cardNumber
  const effectivePhone = phone || parsed.phone

  const applyParsed = () => {
    setError('')
    setResult(null)
    if (!String(raw ?? '').trim()) {
      setParseWarn('Пустой текст — нечего разбирать. Вставьте переписку или вложение.')
      return
    }
    if (!parsed.cardNumber && !parsed.phone) {
      setParseWarn(
        'Программа не поняла текст: не нашла номер карты и телефон. Впишите их вручную в поля ниже.',
      )
      return
    }
    if (parsed.cardNumber) setCard(parsed.cardNumber)
    if (parsed.phone) setPhone(parsed.phone)
    setParseWarn(
      parsed.cardNumber && parsed.phone
        ? 'Поняла: нашла карту и телефон — проверьте поля и нажмите «Найти в Оси».'
        : parsed.cardNumber
          ? 'Поняла только карту. Телефон не нашла — при необходимости допишите.'
          : 'Поняла только телефон (без карты поиск слабее). Лучше дописать карту.',
    )
  }

  const runMatch = async () => {
    if (!clubId) {
      setError('Программа не поняла клуб. Войдите снова или выберите клуб.')
      return
    }
    if (!String(effectiveCard || '').trim() && !String(effectivePhone || '').trim()) {
      setError('Программа не поняла, кого искать: укажите номер карты или телефон.')
      setResult(null)
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await matchSaleClipClient({
        clubId,
        cardNumber: effectiveCard,
        phone: effectivePhone,
        clipDate: todayLocalIso(),
      })
      setResult(data)
      if (data?.match?.status === 'none' || data?.match?.status === 'empty') {
        setError('')
      }
    } catch (e) {
      setError(
        e?.message
          ? `Программа не смогла найти: ${e.message}`
          : 'Программа не смогла найти. Проверьте интернет и повторите.',
      )
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  const match = result?.match
  const clipForClient = result?.clipToday

  return (
    <section className="sales-evening-match card" aria-label="Вечернее входящее">
      <h2 className="sales-report__section-title">
        <Search size={20} aria-hidden /> Вечером: найти клиента
      </h2>
      <p className="muted sales-clip-section__tip">
        Только стыковка. Абонемент вечером не создаём. Если программа не поняла — жёлтое или красное окно ниже.
      </p>

      <label>
        Вставка из переписки / вложения
        <textarea
          rows={3}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setParseWarn('')
          }}
          placeholder="ФИО, карта 5426, телефон…"
        />
      </label>
      <div className="sales-evening-match__actions">
        <button type="button" className="btn btn-xs" onClick={applyParsed} disabled={!raw.trim()}>
          Разобрать текст → поля
        </button>
      </div>

      {parseWarn ? (
        <SalesVisualAlert
          level={/не поняла|Пустой|не нашла номер/i.test(parseWarn) ? 'warn' : 'info'}
          title="Разбор текста"
        >
          <p>{parseWarn}</p>
        </SalesVisualAlert>
      ) : null}

      <div className="sales-evening-match__fields">
        <label>
          № карты
          <input
            value={card}
            onChange={(e) => setCard(e.target.value)}
            placeholder="Главный ключ"
            inputMode="text"
            autoComplete="off"
          />
        </label>
        <label>
          Телефон
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Запасной"
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
      </div>

      <button type="button" className="btn btn-primary" disabled={busy || !clubId} onClick={() => void runMatch()}>
        {busy ? 'Ищем…' : 'Найти в Оси'}
      </button>

      {error ? (
        <SalesVisualAlert level="error" title="Программа не поняла запрос">
          <p>{error}</p>
        </SalesVisualAlert>
      ) : null}

      {match ? (
        <div className="sales-evening-match__result">
          {match.status === 'one' && match.client ? (
            <SalesVisualAlert level="ok" title={match.reason}>
              <p>
                Найден: <strong>{match.client.name}</strong>
                {match.client.card_number
                  ? ` · карта ${normalizeSalesCardNumber(match.client.card_number) || match.client.card_number}`
                  : ''}
                {match.client.phone ? ` · ${match.client.phone}` : ''}
              </p>
              {match.weakMatch ? (
                <p>Внимание: поиск был без карты (слабый). Проверьте, что это тот человек.</p>
              ) : null}
              {clipForClient ? (
                <p>
                  Заявка сегодня:{' '}
                  {normalizeSaleClipStatus(clipForClient.status) === 'done'
                    ? 'подтверждено планшетом'
                    : normalizeSaleClipStatus(clipForClient.status) === 'awaiting'
                      ? 'ещё ждём планшет'
                      : clipForClient.status}
                </p>
              ) : (
                <p>Заявки сегодня нет — сначала отправьте тренеру днём.</p>
              )}
              <p>Создать абонемент из вечера нельзя.</p>
            </SalesVisualAlert>
          ) : null}

          {match.status === 'conflict' ? (
            <SalesVisualAlert level="error" title="Программа не поняла, кого выбрать — два совпадения">
              <p>{match.reason}</p>
              <ul>
                {(match.candidates ?? []).map((c) => (
                  <li key={c.id}>
                    {c.name || c.id}
                    {c.card_number ? ` · ${c.card_number}` : ''}
                  </li>
                ))}
              </ul>
              <p>Разберите вручную с админом — программа сама не выберет.</p>
            </SalesVisualAlert>
          ) : null}

          {match.status === 'none' || match.status === 'empty' ? (
            <SalesVisualAlert level="warn" title="Программа никого не нашла">
              <p>{match.reason}</p>
              <p>Человека вечером не создаём. Заведите заявку днём или проверьте номер карты.</p>
            </SalesVisualAlert>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
