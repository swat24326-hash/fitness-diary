/**
 * Бургер планшета: сверху своё имя → «Мой профиль» с фото и «Настройками» (служебные пункты не в меню);
 * «QR для телефона» раскрывает код прямо в профиле, код целиком виден (раньше отдельное окно запиралось
 * внутри анимированной карточки и обрезалось). Тренер: из профиля — на «Статистику и зарплату», со страницы
 * «Профиль» шестерёнкой — обратно в то же окно.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { screenshot } from '../lib/e2eHarness.mjs'
import { trainerClubSeed } from '../lib/fixtures.mjs'
import { openTrainerSession } from '../lib/trainerSteps.mjs'

export const name = 'меню планшета: Мой профиль — настройки, QR для телефона, связь со страницей «Профиль»'

const TABLET = { viewport: { width: 1024, height: 768 } }

function reaches(locator) {
  return locator
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

export async function run(browser) {
  const c = createChecks('settings-menu')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, trainerClubSeed(), TABLET)
  const invites = []
  backend.coach = (req) => {
    if (req.body?.action !== 'invite' || !req.headers.authorization) return { status: 404, json: { error: 'not configured' } }
    invites.push(req)
    return { status: 200, json: { token: 'e2eQrToken_0123456789abcdefABCD', expires_at: new Date(Date.now() + 600_000).toISOString() } }
  }
  try {
    await page.getByRole('button', { name: 'Меню аккаунта' }).click()
    const menu = page.locator('#app-header-account-menu')
    const row = menu.getByTestId('profile-menu-user')
    c.ok(await reaches(row), 'сверху меню — своё имя, «Мой профиль и настройки»')
    c.ok((await menu.getByRole('button', { name: /^Настройки/ }).count()) === 0, 'отдельного пункта «Настройки» в меню нет')
    c.ok(!(await page.getByRole('button', { name: 'Восстановить приложение' }).isVisible()), 'служебные пункты не в меню')
    c.ok(await reaches(page.getByRole('button', { name: 'Выйти' })), '«Выйти» в меню')

    await row.click()
    const sheet = page.getByTestId('profile-photo-sheet')
    const settings = sheet.getByTestId('profile-settings')
    c.ok(await reaches(settings), '«Мой профиль»: под фото — «Настройки»')
    c.ok(await reaches(settings.getByRole('button', { name: 'Восстановить приложение' })), 'в настройках — «Восстановить приложение»')
    const notifyFold = settings.getByTestId('notifications-fold')
    c.ok(await reaches(notifyFold), 'в настройках — одна кнопка «Уведомления»')
    await notifyFold.click()
    c.ok(await reaches(settings.getByRole('switch', { name: 'Уведомления' })), 'раскрыли — переключатель «Уведомления»')
    c.ok(
      await settings.getByRole('switch', { name: 'Напоминания из Ежедневника' }).isDisabled(),
      'тренеру — «Напоминания из Ежедневника», без уведомлений неактивны',
    )
    c.ok(await reaches(settings.getByRole('button', { name: /Помощь/ })), 'в настройках — «Помощь»')
    await settings.getByRole('button', { name: 'Восстановить приложение' }).scrollIntoViewIfNeeded()
    c.ok(await settings.getByRole('button', { name: 'QR для телефона' }).isVisible(), 'длинный профиль прокручивается — пункты доступны')
    await screenshot(page, 'settings-menu-open')

    c.ok(invites.length === 0, 'пока QR не раскрыли — код не запрашиваем')
    const qrRow = settings.getByRole('button', { name: 'QR для телефона' })
    await qrRow.click()
    const qr = sheet.getByRole('img', { name: 'QR-код для входа с телефона' })
    c.ok(await reaches(qr), 'QR раскрылся прямо в «Мой профиль», под строкой')
    c.ok(await sheet.isVisible(), 'профиль открыт — отдельного окна нет')
    c.ok(invites.length === 1, 'код запрошен со входом планшета')
    await qr.scrollIntoViewIfNeeded()
    const box = await qr.boundingBox()
    c.ok(Boolean(box) && box.y >= 0 && box.y + box.height <= TABLET.viewport.height && box.height >= 200, 'QR целиком на экране, не обрезан')
    await screenshot(page, 'settings-phone-qr')
    await qrRow.click()
    c.ok(!(await qr.isVisible()), 'ещё нажатие — QR свернулся')
    c.ok(!(await menu.isVisible()), 'открыли профиль — бургер закрылся, не висит под окном')

    const statsLink = sheet.getByTestId('profile-stats-link')
    c.ok(await reaches(statsLink), 'тренеру в профиле — «Статистика и зарплата»')
    await sheet.evaluate((el) => el.scrollTo(0, 0))
    const linkBox = await statsLink.boundingBox()
    c.ok(Boolean(linkBox) && linkBox.y + linkBox.height <= TABLET.viewport.height, '«Статистика и зарплата» видна сразу, без прокрутки')
    await statsLink.click()
    await page.waitForURL(/\/trainer\/profile$/, { timeout: 10_000 })
    c.ok(!(await sheet.isVisible()), '«Статистика и зарплата» — окно закрылось, открыта страница «Профиль»')

    const gear = page.getByTestId('trainer-profile-settings')
    c.ok(await reaches(gear), 'на странице «Профиль» — кнопка «Фото и настройки»')
    const touch = await page.locator('.trainer-profile-hero button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))
    c.ok(touch.length === 2 && touch.every((r) => r.width >= 44 && r.height >= 44), 'фото и шестерёнка — зоны нажатия от 44px')
    await screenshot(page, 'trainer-profile-hero')
    await gear.click()
    c.ok(await reaches(sheet.getByTestId('profile-settings')), 'шестерёнка открывает то же окно «Мой профиль» с настройками')
    c.ok((await statsLink.count()) === 0, 'на странице «Профиль» ссылки на саму себя в окне нет')
    await screenshot(page, 'trainer-profile-sheet')
    await page.keyboard.press('Escape')
    c.ok(!(await sheet.isVisible()), 'Esc — окно закрылось, страница на месте')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'settings-menu-FAIL').catch(() => null)
    c.ok(false, `меню планшета: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
