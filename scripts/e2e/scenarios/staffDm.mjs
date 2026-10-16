/**
 * Переписка сотрудников: тренер с телефона → папка «Администрация» (управляющая ярко, менеджер без приложения тускло,
 * главного админа и чужого клуба нет) → пишет управляющей → push ей ведёт в диалог. Управляющая на планшете:
 * папка «Тренеры» с числом → диалог → ответ → push тренеру откроет диалог на телефоне → тренер видит ответ.
 * Главный админ: конверт → сотрудники всей сети → пишет тренеру → у тренера админ в «Администрации», ответ уходит админу.
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'
import { coachPushUrl } from '../../../src/lib/push/pushTargetUrlCore.js'
import { staffDmSideOf } from '../../../src/lib/chat/staffDmAccessCore.js'

export const name = 'переписка сотрудников: тренер ↔ управляющий'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const MONITOR = { viewport: { width: 1600, height: 900 } }
const OTHER_CLUB = 'e2e-other-club'
const LINKED_NAME = 'Александр Кукарек'
const SUP_ID = 'e2e00000-0000-4000-8000-0000000000a2'
const SALES_ID = 'e2e00000-0000-4000-8000-0000000000a3'
const MATE_ID = 'e2e00000-0000-4000-8000-0000000000a4'
const SUP_LOGIN = 'e2e_sup'
const SUP_PASSWORD = randomUUID()
const ADMIN_ID = 'e2e00000-0000-4000-8000-0000000000a5'
const ADMIN_LOGIN = 'e2e_admin_net'
const ADMIN_PASSWORD = randomUUID()
const ASK = 'Сломан тренажёр в зале 2'
const ANSWER = 'Спасибо, вызову мастера'
const FROM_ADMIN = 'Завтра проверка, приходите к 8:00'
const TO_ADMIN = 'Понял, буду'

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function setup() {
  const backend = createFakeBackend(trainerClubSeed())
  const staff = (id, name, role, extra = {}) => ({ id, name, role, club_id: CLUB_ID, is_active: true, ...extra })
  backend.state.users.push(
    staff(SUP_ID, 'Управляющая Ольга', 'supervisor', { login: SUP_LOGIN, email: `${SUP_LOGIN}@trainer.local`, password: SUP_PASSWORD }),
    staff(SALES_ID, 'Менеджер Пётр', 'sales_manager'),
    staff(MATE_ID, 'Коллега Игорь', 'trainer'),
    staff(ADMIN_ID, 'Главный Админ', 'admin', { club_id: null, login: ADMIN_LOGIN, email: `${ADMIN_LOGIN}@trainer.local`, password: ADMIN_PASSWORD }),
    staff('e2e-alien', 'Чужой Тренер', 'trainer', { club_id: OTHER_CLUB }),
    staff('e2e-blocked', 'Уволенный Тренер', 'trainer', { is_active: false }),
    staff('e2e-kuk-t', LINKED_NAME, 'trainer', { club_id: OTHER_CLUB, linked_user_id: 'e2e-kuk-s' }),
    staff('e2e-kuk-s', 'Москва Управляющий', 'supervisor', { club_id: OTHER_CLUB, linked_user_id: 'e2e-kuk-t' }),
  )
  backend.state.clubs.push({ id: OTHER_CLUB, name: 'Москва клуб', is_active: true })
  backend.state.live_user_ids = [SUP_ID, MATE_ID]
  const chat = createFakeChat(backend.state)
  const coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule: [] })
  backend.coach = coach.handle
  backend.adminData = (req, user) => chat.staff(req, user)
  return { backend, chat, coach }
}

const titles = (page) => page.getByTestId('chat-contacts').locator('.chat-contacts__item .chat-row__title').allInnerTexts()

async function trainerWrites(c, page, chat) {
  await page.goto(`${ORIGIN}/coach`)
  await page.getByLabel('Логин').fill(TRAINER_LOGIN)
  await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await page.getByRole('link', { name: /^Сообщения/ }).click()
  const folders = page.getByTestId('chat-folders')
  c.ok(await reaches(folders.getByRole('button', { name: 'Коллеги' })), 'телефон: папки «Клиенты · Коллеги · Администрация»')
  c.ok((await page.locator('.msgr.msgr--phone').count()) === 1, 'телефон тренера — та же рамка мессенджера, что у планшета и админа, одной панелью')
  const tops = await folders.getByRole('button').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
  c.ok(new Set(tops).size === 1, `телефон: папки одной строкой, как вкладки мобильного Telegram (строк: ${new Set(tops).size})`)
  await folders.getByRole('button', { name: 'Коллеги' }).click()
  c.ok(JSON.stringify(await titles(page)) === '["Коллега Игорь"]', 'Коллеги: тренер своего клуба, без чужих и заблокированных')
  await folders.getByRole('button', { name: 'Администрация' }).click()
  const admin = await titles(page)
  c.ok(JSON.stringify(admin) === '["Управляющая Ольга","Менеджер Пётр"]', `Администрация: управляющая ярко сверху, менеджер ниже (${admin.join(', ')})`)
  c.ok((await page.locator('.chat-row--dim').count()) === 1, 'Администрация: менеджер без приложения — тускло')
  await screenshot(page, 'staff-dm-folders')

  await page.getByRole('link', { name: /Управляющая Ольга/ }).click()
  await page.waitForURL(`${ORIGIN}/coach/dm/${SUP_ID}`)
  c.ok(await reaches(page.getByText('Управляющий увидит ваше сообщение', { exact: false })), 'пустой диалог: подсказка, кто увидит')
  await page.getByTestId('chat-input').fill(ASK)
  await page.getByTestId('chat-input').focus()
  await page.getByTestId('chat-send').tap()
  c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: ASK })), 'тренер: сообщение в ленте')
  c.ok(
    await page.evaluate(() => globalThis.document.activeElement?.dataset?.testid === 'chat-input'),
    'палец на самолётике при открытой клавиатуре: ушло с первого раза, клавиатура не прячется (Кукарек, INC-2026-10-13-05)',
  )
  const gap = await page.evaluate(() => {
    const last = [...globalThis.document.querySelectorAll('.chat-msg')].at(-1).getBoundingClientRect()
    return globalThis.document.querySelector('.chat-compose').getBoundingClientRect().top - last.bottom
  })
  c.ok(gap >= 0 && gap < 60, `короткий диалог: сообщение у поля ввода, как в Telegram, — без пустоты (зазор ${Math.round(gap)}px)`)
  await screenshot(page, 'staff-dm-coach-short')
  const bar = await page.evaluate(() => {
    const top = globalThis.document.querySelector('.coach-app__top')
    const back = top?.querySelector('a[aria-label="К списку"]')?.getBoundingClientRect()
    const name = top?.querySelector('.chat-bar__title')?.getBoundingClientRect()
    return { bars: globalThis.document.querySelectorAll('.coach-app__top').length, backLeft: back && name && back.right <= name.left }
  })
  c.ok(bar.bars === 1 && bar.backLeft, 'телефон тренера: в диалоге одна шапка диалога, «←» слева от имени, как в Telegram')

  /* iPhone: тянут пальцем без клавиатуры — страница не пружинит, высота не пересчитывается во время жеста (INC-2026-10-14-04). */
  c.ok(
    await page.evaluate(() => globalThis.getComputedStyle(globalThis.document.documentElement).overscrollBehaviorY === 'none'),
    'открыт диалог — страница целиком не пружинит, только лента',
  )
  const fitH = () => page.locator('.chat-thread').evaluate((el) => el.style.getPropertyValue('--chat-fit-h'))
  const before = await fitH()
  await page.evaluate(() => globalThis.document.dispatchEvent(new globalThis.Event('touchstart')))
  await page.setViewportSize({ width: 390, height: 700 })
  await page.waitForTimeout(300)
  c.ok((await fitH()) === before, `палец на экране — высота диалога не дёргается за каждым кадром (${before})`)
  await page.evaluate(() => globalThis.document.dispatchEvent(new globalThis.Event('touchend')))
  await page.waitForTimeout(300)
  const after = await fitH()
  c.ok(after !== before, `отпустил — диалог подогнан под экран (${before} → ${after})`)
  await page.setViewportSize(PHONE.viewport)
  await page.waitForTimeout(300)
  const saved = chat.state.dm.messages.at(-1)
  c.ok(saved?.author_user_id === TRAINER_ID && saved?.body === ASK, 'на сервер ушло сообщение от тренера')
  const push = chat.state.dm.pushes.at(-1)
  c.ok(push?.to === SUP_ID && push?.url === `/messages/dm/${TRAINER_ID}`, 'push управляющей ведёт в диалог с тренером')
}

async function supervisorAnswers(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  try {
    await loginUi(page, SUP_LOGIN, SUP_PASSWORD)
    await page.goto(`${ORIGIN}/messages`)
    const folders = page.getByTestId('chat-folders')
    const trainers = folders.getByRole('button', { name: /^Тренеры/ })
    c.ok(await reaches(trainers), 'планшет управляющего: папка «Тренеры»')
    c.ok(
      await trainers.evaluate((el) => el.getAttribute('aria-pressed') === 'true').catch(() => false),
      'ждёт ответа тренер — мессенджер сразу открыт на «Тренерах»',
    )
    const cut = await folders.evaluate((nav) => {
      const box = nav.getBoundingClientRect()
      return [...nav.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().right > box.right + 1).map((b) => b.textContent)
    })
    c.ok(cut.length === 0, `все папки управляющего видны целиком, без прокрутки вбок${cut.length ? ` (обрезаны: ${cut.join(', ')})` : ''}`)
    c.ok(await reaches(trainers.getByLabel('Ждут ответа: 1')), '«Тренеры»: 1 ждёт ответа')
    c.ok(await reaches(folders.getByRole('button', { name: /^Клиенты/ })), 'и «Клиенты» — прежний список диалогов')
    await trainers.click()
    const row = page.getByRole('link', { name: /Тренер Тестов/ })
    c.ok(await reaches(row.locator('.chat-row__badge', { hasText: '1' })), 'у тренера кружок «1»')
    await screenshot(page, 'staff-dm-supervisor-list')
    await row.click()
    await page.waitForURL(new RegExp(`/messages\\?.*dm=${TRAINER_ID}`))
    c.ok(await reaches(page.locator('.chat-msg', { hasText: ASK })), 'управляющая видит сообщение тренера')
    await page.getByTestId('chat-input').fill(ANSWER)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: ANSWER })), 'ответ в ленте')
    const push = chat.state.dm.pushes.at(-1)
    c.ok(push?.to === TRAINER_ID && coachPushUrl(push.url) === `/coach/dm/${SUP_ID}`, 'push тренеру откроет диалог на телефоне')
    await screenshot(page, 'staff-dm-supervisor-thread')

    await page.setViewportSize(MONITOR.viewport)
    await page.waitForTimeout(200)
    const m = await page.evaluate(() => {
      const box = (sel) => globalThis.document.querySelector(sel)?.getBoundingClientRect()
      const tabs = [...globalThis.document.querySelectorAll('[data-testid="chat-folders"] button')].map((b) => b.getBoundingClientRect())
      return {
        cols: box('.msgr__rail').left < box('.msgr__list').left && box('.msgr__list').left < box('.msgr__thread').left,
        stacked: tabs.length > 1 && tabs.every((t, i) => !i || t.top >= tabs[i - 1].bottom - 1),
      }
    })
    c.ok(m.cols && m.stacked, 'монитор управляющего — как у админа: папки столбиком слева, список, диалог')
    await screenshot(page, 'staff-dm-supervisor-monitor')
  } catch (e) {
    await screenshot(page, 'staff-dm-supervisor-FAIL').catch(() => null)
    c.ok(false, `управляющая: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/** Тренер в приложении зала на узком телефоне: шапка не шире экрана, поле ввода у низа видимой части (INC-2026-10-11-04). */
async function trainerNarrowPhoneThread(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, { ...PHONE, viewport: { width: 360, height: 780 } })
  const page = await context.newPage()
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.goto(`${ORIGIN}/messages/dm/${SUP_ID}`)
    await page.getByTestId('chat-input').waitFor()
    await page.waitForTimeout(300)
    const opened = await page.evaluate(() => ({
      lastBottom: [...globalThis.document.querySelectorAll('.chat-msg')].at(-1).getBoundingClientRect().bottom,
      composeTop: globalThis.document.querySelector('.chat-compose').getBoundingClientRect().top,
    }))
    c.ok(
      opened.lastBottom <= opened.composeTop + 1,
      `открыл диалог — последнее сообщение над полем ввода, не под ним (низ ${Math.round(opened.lastBottom)}, поле с ${Math.round(opened.composeTop)})`,
    )
    const m = await page.evaluate(() => {
      const root = globalThis.document.documentElement
      return {
        wide: root.scrollWidth - root.clientWidth,
        composerBottom: globalThis.document.querySelector('.chat-compose').getBoundingClientRect().bottom,
        visible: globalThis.visualViewport?.height ?? globalThis.innerHeight,
      }
    })
    c.ok(m.wide <= 0, `узкий телефон тренера: страница не шире экрана (лишних ${m.wide}px)`)
    c.ok(m.composerBottom <= m.visible + 1, `поле ввода в видимой части (низ ${Math.round(m.composerBottom)} из ${Math.round(m.visible)})`)
    await screenshot(page, 'staff-dm-trainer-narrow')

    /* Клавиатура Android сжимает страницу: был внизу — последнее сообщение остаётся над полем ввода. */
    await page.setViewportSize({ width: 360, height: 420 })
    await page.waitForTimeout(400)
    const kb = await page.evaluate(() => {
      const last = [...globalThis.document.querySelectorAll('.chat-msg')].at(-1).getBoundingClientRect()
      const compose = globalThis.document.querySelector('.chat-compose').getBoundingClientRect()
      return { lastBottom: last.bottom, composeTop: compose.top }
    })
    c.ok(
      kb.lastBottom <= kb.composeTop + 1,
      `клавиатура открылась — последнее сообщение над полем ввода (низ ${Math.round(kb.lastBottom)}, поле с ${Math.round(kb.composeTop)})`,
    )
    await screenshot(page, 'staff-dm-trainer-keyboard')

    /* Читает историю выше, а собеседник ответил — лента не прыгает вниз, появляется «↓ Новые». */
    const feedTop = () => page.getByTestId('chat-feed').evaluate((f) => f.scrollTop)
    await page.getByTestId('chat-feed').evaluate((f) => f.scrollTo(0, 0))
    await page.waitForTimeout(200)
    const sup = backend.state.users.find((u) => u.id === SUP_ID)
    chat.staff({ method: 'POST', searchParams: new URLSearchParams({ action: 'chat' }), body: { op: 'dm-send', user_id: TRAINER_ID, body: 'Пока ты листал' } }, sup)
    const dmThread = chat.state.dm.threads.find((t) => staffDmSideOf(t, TRAINER_ID) && staffDmSideOf(t, SUP_ID))
    const trainerUnread = () => dmThread[`${staffDmSideOf(dmThread, TRAINER_ID)}_unread`]
    await page.evaluate(() =>
      globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-received' } })),
    )
    const newBelow = page.getByTestId('chat-new-below')
    c.ok(await reaches(newBelow), 'читает историю, пришёл ответ — кнопка «↓ Новые»')
    c.ok((await feedTop()) < 50, 'лента не дёрнулась вниз, пока читает историю')
    c.ok(trainerUnread() === 1, 'новое ещё не на экране — «прочитано» не поставлено, у управляющей без ✓✓')
    await screenshot(page, 'staff-dm-new-below')
    await newBelow.click()
    c.ok(await reaches(page.getByTestId('chat-new-below'), 'hidden'), '«↓ Новые» — вниз к ответу, кнопка исчезла')
    await page.waitForTimeout(800)
    c.ok(trainerUnread() === 0, 'долистал до нового — «прочитано» поставлено сразу, без ожидания опроса')
    const lateBox = await page.locator('.chat-msg', { hasText: 'Пока ты листал' }).boundingBox()
    const composeTop = await page.evaluate(() => globalThis.document.querySelector('.chat-compose').getBoundingClientRect().top)
    c.ok(lateBox && lateBox.y + lateBox.height <= composeTop + 1, 'новое сообщение видно над полем ввода')
  } catch (e) {
    await screenshot(page, 'staff-dm-trainer-narrow-FAIL').catch(() => null)
    c.ok(false, `узкий телефон тренера: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/**
 * iPhone: клавиатура уменьшает только видимую часть (visualViewport), страницу не сжимает
 * (INC-2026-10-13-05, Кукарек: «окно для набора улетает вверх», «ездит за чатом»). Как Telegram: поле ввода
 * ровно над клавиатурой, шапка на месте, листается лента — поле и страница стоят.
 */
async function iphoneKeyboardAfterSend(c, browser, backend) {
  const KB = 340
  const context = await newE2eContext(browser, backend, PHONE)
  await context.addInitScript((kb) => {
    const vv = new EventTarget()
    const h = () => globalThis.innerHeight
    Object.assign(vv, { offsetTop: 0, offsetLeft: 0, scale: 1, width: 390, pageTop: 0, pageLeft: 0 })
    Object.defineProperty(vv, 'height', { get: () => (globalThis.__kbOpen ? h() - kb : h()) })
    Object.defineProperty(globalThis, 'visualViewport', { value: vv, configurable: true })
    globalThis.__fakeVv = vv
  }, KB)
  const page = await context.newPage()
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.goto(`${ORIGIN}/messages/dm/${SUP_ID}`)
    await page.getByTestId('chat-input').waitFor()
    await page.evaluate(() => {
      globalThis.__kbOpen = true
      globalThis.__fakeVv.dispatchEvent(new Event('resize'))
    })
    await page.waitForTimeout(300)
    const at = () =>
      page.evaluate(() => ({
        composeBottom: globalThis.document.querySelector('.chat-compose').getBoundingClientRect().bottom,
        headTop: globalThis.document.querySelector('.chat-thread').getBoundingClientRect().top,
        view: globalThis.visualViewport.height,
        pageY: globalThis.scrollY,
        lastBottom: [...globalThis.document.querySelectorAll('.chat-msg')].at(-1).getBoundingClientRect().bottom,
        composeTop: globalThis.document.querySelector('.chat-compose').getBoundingClientRect().top,
      }))
    const open = await at()
    c.ok(
      open.composeBottom <= open.view + 1 && open.composeBottom >= open.view - 40,
      `iPhone, клавиатура открыта — поле ввода над ней, не выше и не под ней (низ поля ${Math.round(open.composeBottom)}, клавиатура с ${Math.round(open.view)})`,
    )
    c.ok(open.lastBottom <= open.composeTop + 1, 'последнее сообщение над полем ввода')
    await screenshot(page, 'staff-dm-iphone-keyboard')

    await page.getByTestId('chat-feed').evaluate((f) => f.scrollTo(0, 0))
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(300)
    const scrolled = await at()
    c.ok(
      scrolled.pageY === 0 && Math.abs(scrolled.composeBottom - open.composeBottom) < 1 && Math.abs(scrolled.headTop - open.headTop) < 1,
      `листает ленту — поле ввода и шапка стоят, страница не ездит (сдвиг поля ${Math.round(scrolled.composeBottom - open.composeBottom)}px, страницы ${scrolled.pageY}px)`,
    )
    await page.evaluate(() => globalThis.scrollTo(0, 400))
    await page.waitForTimeout(300)
    const nudged = await at()
    c.ok(nudged.pageY === 0, `страницу нечем сдвинуть — всё влезло в видимую часть (сдвиг ${nudged.pageY}px)`)

    const panTo = (top) =>
      page.evaluate((t) => {
        globalThis.__fakeVv.offsetTop = t
        globalThis.__fakeVv.dispatchEvent(new Event('scroll'))
      }, top)
    await panTo(KB)
    await page.waitForTimeout(300)
    const panned = await at()
    c.ok(
      panned.composeBottom <= KB + panned.view + 1 && panned.composeBottom >= KB + panned.view - 40 && panned.headTop >= KB - 1,
      `iPhone сдвинул видимую часть к полю ввода — диалог едет за ней, поле над клавиатурой, не «за горизонтом» (низ поля ${Math.round(panned.composeBottom - KB)} от верха видимой части, клавиатура с ${Math.round(panned.view)})`,
    )
    c.ok(!(await page.locator('.app-chrome-top').isVisible()), 'iPhone: в открытом диалоге шапки приложения нет — сверху только шапка диалога')
    await screenshot(page, 'staff-dm-iphone-panned')
    await panTo(0)
    await page.waitForTimeout(300)
    const back = await at()
    c.ok(Math.abs(back.composeBottom - open.composeBottom) < 1, 'видимая часть вернулась — диалог на прежнем месте')
  } catch (e) {
    await screenshot(page, 'staff-dm-iphone-kb-FAIL').catch(() => null)
    c.ok(false, `iPhone клавиатура: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

const sectionNames = (page, club) =>
  page.getByTestId('staff-people').getByRole('region', { name: club }).locator('.chat-row__title').allInnerTexts()
const peopleNames = (page) => page.getByTestId('staff-people').locator('.chat-row__title').allInnerTexts()

/**
 * Главный админ на мониторе, как Telegram на компьютере: слева клубы, в середине люди, справа диалог.
 * Поиск — по клубу и по человеку; управляющий, совмещённый с тренером, — под ФИО из тренерской (INC-2026-10-13-03).
 */
async function adminWrites(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, MONITOR)
  const page = await context.newPage()
  try {
    await loginUi(page, ADMIN_LOGIN, ADMIN_PASSWORD)
    const envelope = page.getByRole('link', { name: /^Сообщения сотрудников/ })
    c.ok(await reaches(envelope), 'админ: в шапке конверт «Сообщения сотрудников»')
    await envelope.click()
    const rail = page.getByRole('navigation', { name: 'Клубы' })
    c.ok(await reaches(rail), 'админ: слева клубы, как папки Telegram')
    c.ok(await reaches(page.getByText('Выберите, кому написать')), 'справа — «Выберите, кому написать»')
    c.ok((await page.getByTestId('chat-folders').count()) === 0, 'админ: без папок «Клиенты» — клиентов читает из карточки')
    c.ok((await page.getByRole('link', { name: 'Рассылки' }).count()) === 0, 'админ: вкладки «Рассылки» нет')
    const railTitles = await rail.locator('.chat-folders__label').allInnerTexts()
    c.ok(JSON.stringify(railTitles.slice(0, 2)) === '["Все клубы","Ждут ответа"]' && railTitles.includes('E2E клуб') && railTitles.includes('Москва клуб'), `слева: «Все клубы», «Ждут ответа», клубы (${railTitles.join(', ')})`)

    await rail.getByRole('button', { name: /E2E клуб/ }).click()
    await page.getByTestId('staff-people').getByRole('region', { name: 'Москва клуб' }).waitFor({ state: 'detached' })
    c.ok(new URL(page.url()).searchParams.get('view')?.startsWith('club:'), 'выбранный клуб — в адресе (назад браузера вернёт)')
    const reachable = await peopleNames(page)
    c.ok(JSON.stringify(reachable) === '["Управляющая Ольга","Коллега Игорь"]', `клуб: сверху — с приложением, управляющая первой (${reachable.join(', ')})`)
    await page.getByRole('button', { name: /Без приложения · 2/ }).click()
    const home = await peopleNames(page)
    c.ok(home.includes('Тренер Тестов') && home.includes('Менеджер Пётр') && !home.some((n) => n.startsWith('Уволенный')), `«Без приложения» раскрывается, уволенных нет (${home.join(', ')})`)

    await rail.getByRole('button', { name: /Все клубы/ }).click()
    await page.getByTestId('staff-people').getByRole('region', { name: 'Москва клуб' }).waitFor()
    const moscow = await sectionNames(page, 'Москва клуб')
    c.ok(moscow.includes(LINKED_NAME) && moscow.includes('Чужой Тренер'), `«Все клубы»: разделы по клубам, чужой клуб виден (${moscow.join(', ')})`)
    c.ok(!moscow.includes('Москва Управляющий') && moscow.filter((n) => n === LINKED_NAME).length === 1, 'совмещённый управляющий — один раз и под ФИО')
    await screenshot(page, 'staff-dm-admin-columns')

    const kuk = backend.state.users.find((u) => u.id === 'e2e-kuk-s')
    chat.staff({ method: 'POST', searchParams: new URLSearchParams({ action: 'chat' }), body: { op: 'dm-send', user_id: ADMIN_ID, body: 'Вопрос по графику' } }, kuk)
    await page.evaluate(() =>
      globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-received' } })),
    )
    const waiting = rail.getByLabel(/^Ждут ответа: /)
    c.ok(await reaches(waiting.first()), 'пришёл push — слева «Ждут ответа» с числом, без перезагрузки')

    const search = page.getByRole('searchbox', { name: 'Найти клуб или сотрудника' })
    await search.fill('москва')
    c.ok((await page.getByTestId('staff-people').getByRole('region').count()) === 1 && (await sectionNames(page, 'Москва клуб')).length === 2, 'поиск по клубу — весь клуб')
    c.ok(await reaches(page.getByRole('status').filter({ hasText: 'Нашли 2 · 1 клуб' })), 'под поиском: «Нашли 2 · 1 клуб»')
    await search.fill('кукарек')
    c.ok(JSON.stringify(await peopleNames(page)) === JSON.stringify([LINKED_NAME]), 'поиск по человеку — только он')
    await screenshot(page, 'staff-dm-admin-search')

    await page.getByRole('link', { name: new RegExp(LINKED_NAME) }).click()
    c.ok(await reaches(page.getByText('Управляющий · тренер').first()), 'диалог справа: ФИО и «Управляющий · тренер»')
    c.ok(await reaches(rail), 'список не пропал — диалог открыт рядом')
    c.ok(await reaches(waiting.first(), 'hidden'), 'открыл диалог — «прочитано», число у клубов и «Ждут ответа» исчезло сразу')
    await search.fill('тестов')
    await page.getByTestId('staff-people').getByRole('link', { name: /Тренер Тестов/ }).click()
    c.ok(new URL(page.url()).searchParams.get('dm') === TRAINER_ID, 'открытый диалог — в адресе')
    await page.getByTestId('chat-input').waitFor()
    c.ok(await reaches(page.locator('.chat-row--selected', { hasText: 'Тренер Тестов' })), 'выбранный человек подсвечен в списке')
    c.ok(!(await page.getByRole('link', { name: 'К списку' }).isVisible()), 'монитор: «К списку» не нужен — список рядом')
    await page.getByTestId('chat-input').fill(FROM_ADMIN)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: FROM_ADMIN })), 'админ: сообщение тренеру в ленте')
    const push = chat.state.dm.pushes.at(-1)
    c.ok(push?.to === TRAINER_ID && coachPushUrl(push.url) === `/coach/dm/${ADMIN_ID}`, 'push тренеру откроет диалог с админом на телефоне')
    await search.fill('')
    const recent = page.getByTestId('staff-people').getByRole('region', { name: 'Переписки' })
    c.ok(await reaches(recent.getByText('Тренер Тестов · E2E клуб')), '«Все клубы»: кому написал — сверху в «Переписках», с клубом')
    c.ok(!(await sectionNames(page, 'E2E клуб')).includes('Тренер Тестов'), 'в разделе клуба его больше нет — без дублей')
    await screenshot(page, 'staff-dm-admin-thread')

    /* Push до компьютера не дошёл: конверт узнал о новом при возврате в окно — список обновился вместе с ним (INC-2026-10-13-04). */
    c.ok(await reaches(waiting.first(), 'hidden'), 'перед проверкой: ждущих ответа нет')
    chat.staff({ method: 'POST', searchParams: new URLSearchParams({ action: 'chat' }), body: { op: 'dm-send', user_id: ADMIN_ID, body: 'Без push' } }, kuk)
    await page.evaluate(() => globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange')))
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения сотрудников: 1 новых' })), 'без push: вернулся в окно — на конверте «1»')
    c.ok(await reaches(waiting.first()), 'и в мессенджере сразу «Ждут ответа» с числом — без кнопки «Обновить»')
    c.ok(await reaches(page.getByTestId('staff-people').getByText('Без push')), 'в списке — само новое сообщение')
    await page.getByRole('button', { name: 'Меню аккаунта' }).click()
    await page.getByTestId('profile-menu-user').click()
    await page.getByTestId('notifications-fold').click()
    c.ok(await reaches(page.getByRole('switch', { name: 'Уведомления' })), 'админ: «Уведомления» → раскрыли → переключатель, как у всех')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Меню аккаунта' }).click()
    const layout = () =>
      page.evaluate(() => {
        const box = (sel) => globalThis.document.querySelector(sel)?.getBoundingClientRect()
        const rail = box('.msgr__rail')
        const list = box('.msgr__list')
        const thread = box('.msgr__thread')
        return { railLeft: rail?.left, listLeft: list?.left, threadLeft: thread?.left, railBelow: rail && list ? list.top >= rail.bottom - 1 : false }
      })
    const wide = await layout()
    c.ok(wide.railLeft < wide.listLeft && wide.listLeft < wide.threadLeft, 'монитор: три колонки — клубы, люди, диалог')
    const listWidth = () => page.locator('.msgr__list').evaluate((el) => Math.round(el.getBoundingClientRect().width))
    const before = await listWidth()
    const handle = await page.getByRole('separator', { name: 'Ширина списка' }).boundingBox()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 200)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + 200, { steps: 6 })
    await page.mouse.up()
    const dragged = await listWidth()
    c.ok(dragged >= before + 100, `монитор: потянул разделитель — список шире (${before} → ${dragged}px)`)
    await page.reload()
    await page.locator('.msgr__list').waitFor()
    c.ok(Math.abs((await listWidth()) - dragged) <= 2, 'ширина запомнилась — после перезагрузки та же')
    await page.getByRole('separator', { name: 'Ширина списка' }).dblclick()
    c.ok(Math.abs((await listWidth()) - before) <= 2, 'двойной щелчок по разделителю — как было')
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.waitForTimeout(200)
    const tablet = await layout()
    c.ok(
      tablet.railLeft === tablet.listLeft && tablet.railBelow && tablet.threadLeft > tablet.listLeft && !(await page.getByRole('link', { name: 'К списку' }).isVisible()),
      'планшет: как у тренера — клубы кнопками над людьми, диалог справа, без «К списку»',
    )
    await page.setViewportSize({ width: 700, height: 900 })
    const back = page.getByRole('link', { name: 'К списку' })
    c.ok((await reaches(back)) && !(await rail.isVisible()), 'телефон: открыт диалог — только он и «К списку»')
    c.ok(!(await page.locator('.app-header').isVisible()), 'телефон: открыт диалог — шапки приложения нет, как в Telegram')
    await back.click()
    c.ok((await reaches(rail)) && !(await page.getByTestId('chat-input').isVisible()), 'телефон: «К списку» — снова клубы и люди')
    c.ok(await page.locator('.app-header').isVisible(), 'телефон: вернулся к списку — шапка приложения снова на месте')
  } catch (e) {
    await screenshot(page, 'staff-dm-admin-FAIL').catch(() => null)
    c.ok(false, `админ: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/** Тренер с телефона: админ написал — он появился в «Администрации», можно ответить. */
async function trainerAnswersAdmin(c, page, chat) {
  await page.goto(`${ORIGIN}/coach`)
  await page.getByRole('link', { name: /^Сообщения/ }).click()
  const folders = page.getByTestId('chat-folders')
  await folders.getByRole('button', { name: /^Администрация/ }).click()
  const row = page.getByRole('link', { name: /Главный Админ/ })
  c.ok(await reaches(row), 'тренер: главный админ написал — он в «Администрации»')
  await row.click()
  await page.waitForURL(`${ORIGIN}/coach/dm/${ADMIN_ID}`)
  c.ok(await reaches(page.locator('.chat-msg', { hasText: FROM_ADMIN })), 'тренер видит сообщение админа')
  await page.getByTestId('chat-input').fill(TO_ADMIN)
  await page.getByTestId('chat-send').click()
  c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: TO_ADMIN })), 'тренер ответил админу')
  const saved = chat.state.dm.messages.at(-1)
  c.ok(saved?.author_user_id === TRAINER_ID && saved?.body === TO_ADMIN, 'ответ админу ушёл на сервер')
  c.ok(chat.state.dm.pushes.at(-1)?.to === ADMIN_ID, 'push — админу')
}

export async function run(browser) {
  const c = createChecks('staff-dm')
  const { backend, chat } = setup()
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await trainerWrites(c, page, chat)
    await page.getByRole('link', { name: 'К списку' }).click()
    const tab = page.getByRole('link', { name: 'Сообщения, новых диалогов: 1' })
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения', exact: true })), 'вкладка «Сообщения» без числа, пока ответа нет')
    await supervisorAnswers(c, browser, backend, chat)
    await page.evaluate(() =>
      globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-received' } })),
    )
    c.ok(
      await tab.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false),
      'пришёл push — число на вкладке «Сообщения» сразу, без переключения вкладок',
    )
    const first = chat.state.dm.messages[0]
    for (let i = 1; i <= 20; i++) {
      chat.state.dm.messages.splice(i - 1, 0, { ...first, id: `dmm-old-${i}`, body: `История ${i}`, created_at: new Date(Date.parse(first.created_at) - (21 - i) * 60_000).toISOString() })
    }
    await trainerNarrowPhoneThread(c, browser, backend, chat)
    await iphoneKeyboardAfterSend(c, browser, backend)
    /* Приложение уже открыто, нажали на push — открывается сам диалог (INC-2026-10-12-04). */
    await page.goto(`${ORIGIN}/coach`)
    await page.waitForLoadState('networkidle')
    await page.evaluate((url) => {
      globalThis.__noReload = true
      globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-open', url } }))
    }, `/coach/dm/${SUP_ID}`)
    c.ok(
      await page
        .waitForURL(`**/coach/dm/${SUP_ID}`, { timeout: 5_000 })
        .then(() => true)
        .catch(() => false),
      'нажатие на push при открытом приложении — сразу в переписку',
    )
    c.ok(await page.evaluate(() => globalThis.__noReload === true), 'без перезагрузки страницы')
    c.ok(await reaches(page.locator('.chat-msg:not(.chat-msg--mine)', { hasText: ANSWER })), 'тренер видит ответ управляющей')
    c.ok(await reaches(page.locator('.chat-msg--mine .chat-msg__tick.is-read').first()), 'у тренера две галочки — прочитано')
    await screenshot(page, 'staff-dm-coach-thread')
    await adminWrites(c, browser, backend, chat)
    await trainerAnswersAdmin(c, page, chat)
    c.ok(pageErrors.length === 0, `телефон: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'staff-dm-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
