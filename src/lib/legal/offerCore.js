/**
 * Оферта на доступ к Ядру для клуба (управляющий принимает при первом входе).
 * Реквизиты ИП — публичные; не юридическая консультация.
 */
import { PRODUCT_BRAND_NAME } from '../productBrand.js'

export const OFFER_PATH = '/offer'
export const OFFER_LINK_RU = 'Оферта'
export const OFFER_TITLE = `Оферта · ${PRODUCT_BRAND_NAME}`
/** Менять при существенной правке текста — управляющий примет заново. */
export const OFFER_VERSION = '2026-10-16'
export const OFFER_UPDATED = '2026-10-16'

/**
 * Публичные реквизиты исполнителя (ИП).
 * registeredOn — из свидетельства о регистрации ИП (форма 61003), владелец подтвердил документы 16.10.2026.
 * address — только город (осознанно, без улицы). email — личный контакт исполнителя.
 */
export const OFFER_PARTY = Object.freeze({
  name: 'Семенов Дмитрий Александрович',
  inn: '325502073860',
  ogrnip: '316325600050493',
  address: 'г. Брянск',
  email: '2806199@bk.ru',
  registeredOn: '2016-01-12',
})

export function offerPartyLine() {
  const p = OFFER_PARTY
  return `ИП ${p.name}, ИНН ${p.inn}, ОГРНИП ${p.ogrnip}, ${p.address}, ${p.email}`
}

/**
 * Принимает оферту только управляющий клуба (роль supervisor).
 * Действующие клубы (уже вошли раньше): после выкатки тоже один раз видят экран —
 * так в базе появляется факт согласия на этот текст. Молча «проставить всем» слабее для спора.
 * @param {string | null | undefined} role
 * @param {{ offer_accepted_at?: string | null, offer_version?: string | null } | null | undefined} profile
 */
export function staffNeedsOfferAccept(role, profile) {
  if (String(role ?? '') !== 'supervisor') return false
  return !hasAcceptedCurrentOffer(profile)
}

export function hasAcceptedCurrentOffer(profile) {
  const at = profile?.offer_accepted_at
  const ver = String(profile?.offer_version ?? '').trim()
  if (typeof at !== 'string' || !at.trim()) return false
  if (Number.isNaN(Date.parse(at))) return false
  return ver === OFFER_VERSION
}

/**
 * Короткий лид экрана принятия (управляющий на мониторе): и для нового клуба, и для уже работающего.
 * Длинный сценарий выкатки — docs/PD_152FZ.md §8.
 */
export function offerGateLeadRu(version = OFFER_VERSION) {
  return `Доступ к клубу на месте. Один раз подтвердите условия (версия ${version}) — и продолжайте работу.`
}

/**
 * Разделы оферты для страницы и экрана принятия.
 * @returns {{ id: string, title: string, body: string }[]}
 */
export function offerSections() {
  const brand = PRODUCT_BRAND_NAME
  const p = OFFER_PARTY
  return [
    {
      id: 'party',
      title: 'Исполнитель',
      body: `Индивидуальный предприниматель ${p.name}, ИНН ${p.inn}, ОГРНИП ${p.ogrnip}, адрес ${p.address}. Связь: ${p.email}. Дата регистрации ИП — 12.01.2016.`,
    },
    {
      id: 'subject',
      title: 'Предмет',
      body: `Исполнитель предоставляет Заказчику (клубу, от имени которого действует управляющий) доступ к программе «${brand}» (сайт app-core.ru) для учёта клиентов, абонементов, тренировок и связанных функций своего клуба. Доступ для клубов‑друзей — бесплатный, пока стороны не договорятся иначе.`,
    },
    {
      id: 'pd',
      title: 'Персональные данные',
      body: `Данные клиентов и сотрудников клуба принадлежат клубу: клуб — оператор, Исполнитель — обработчик по поручению клуба. Исполнитель хранит данные на серверах в РФ (Yandex Cloud), не продаёт базу и не использует её «на сторону». Клуб сам подаёт уведомление в Роскомнадзор и получает согласия клиентов. Политика обработки Исполнителем — страница /privacy.`,
    },
    {
      id: 'access',
      title: 'Доступы',
      body: `Учётные записи — только для сотрудников своего клуба. Не передавать пароли в общие чаты, сразу отключать уволенных. Заказчик не получает доступ к облаку, сервисным ключам и чужим клубам.`,
    },
    {
      id: 'duties',
      title: 'Обязанности',
      body: `Исполнитель поддерживает работу программы в разумных пределах и по запросу при уходе клуба помогает с выгрузкой или удалением данных в срок до 30 дней. Заказчик использует программу только для своего клуба и не пытается получить чужие данные.`,
    },
    {
      id: 'term',
      title: 'Срок',
      body: `Соглашение действует с момента принятия оферты управляющим в программе и бессрочно, пока одна сторона не расторгнет, предупредив другую за 7 календарных дней (email Исполнителя: ${p.email}).`,
    },
    {
      id: 'accept',
      title: 'Принятие',
      body: `Нажатие «Принимаю» управляющим в программе «${brand}» с отметкой о согласии означает принятие этой оферты версии ${OFFER_VERSION} от имени клуба. Бумажный договор с клубом при необходимости оформляется отдельно.`,
    },
  ]
}

export const OFFER_MUST_COVER = Object.freeze([
  OFFER_PARTY.inn,
  OFFER_PARTY.ogrnip,
  OFFER_PARTY.email,
  'обработчик',
  '30 дней',
  OFFER_VERSION,
])
