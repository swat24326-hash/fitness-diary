/**
 * Бургер планшета: служебное свёрнуто в «Настройки» → «QR для телефона» открывает окно поверх экрана,
 * код целиком виден (раньше окно запиралось внутри анимированной карточки и обрезалось).
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { screenshot } from '../lib/e2eHarness.mjs'
import { trainerClubSeed } from '../lib/fixtures.mjs'
import { openTrainerSession } from '../lib/trainerSteps.mjs'

export const name = 'меню планшета: Настройки и QR для телефона'

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
    const settings = page.getByRole('button', { name: /Настройки/ })
    c.ok(await reaches(settings), 'в меню есть «Настройки»')
    c.ok(!(await page.getByRole('button', { name: 'Восстановить приложение' }).isVisible()), 'служебные пункты свёрнуты')
    c.ok(await reaches(page.getByRole('button', { name: 'Выйти' })), '«Выйти» снаружи')

    await settings.click()
    c.ok(await reaches(page.getByRole('button', { name: 'Восстановить приложение' })), 'раскрыли — «Восстановить приложение»')
    c.ok(await reaches(page.getByRole('switch', { name: 'Уведомления' })), 'раскрыли — переключатель «Уведомления»')
    c.ok(
      await page.getByRole('switch', { name: 'Напоминания из Ежедневника' }).isDisabled(),
      'тренеру — «Напоминания из Ежедневника», без уведомлений неактивны',
    )
    const menuBox = await page.locator('#app-header-account-menu').boundingBox()
    c.ok(Boolean(menuBox) && menuBox.y + menuBox.height <= TABLET.viewport.height, 'раскрытое меню не уходит за низ экрана')
    await screenshot(page, 'settings-menu-open')

    await page.getByRole('button', { name: 'QR для телефона' }).click()
    const qr = page.getByRole('img', { name: 'QR-код для входа с телефона' })
    c.ok(await reaches(qr), 'окно с QR открылось')
    c.ok(invites.length === 1, 'код запрошен со входом планшета')
    const box = await qr.boundingBox()
    c.ok(Boolean(box) && box.y >= 0 && box.y + box.height <= TABLET.viewport.height && box.height >= 200, 'QR целиком на экране, не обрезан')
    await screenshot(page, 'settings-phone-qr')
    await page.getByRole('dialog').getByRole('button', { name: /Закрыть/ }).click()
    c.ok(!(await qr.isVisible()), 'окно закрывается')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'settings-menu-FAIL').catch(() => null)
    c.ok(false, `меню планшета: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
