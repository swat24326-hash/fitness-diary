/**
 * Рендер мерного рациона в PNG (canvas, без сторонних серверов).
 * @param {object} plan
 * @param {{ clientName?: string, clubLabel?: string }} meta
 * @returns {Promise<Blob>}
 */
export async function renderNutritionPlanPng(plan, meta = {}) {
  const width = 800
  const padding = 32
  const lineH = 22
  const mealGap = 16

  const dayPlan = Array.isArray(plan?.dayPlan) ? plan.dayPlan : []
  let height = padding + 120
  for (const meal of dayPlan) {
    height += lineH * 2
    height += (meal.items?.length ?? 0) * lineH
    height += lineH + mealGap
  }
  height += 80

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')

  ctx.fillStyle = '#0f1419'
  ctx.fillRect(0, 0, width, height)

  let y = padding
  ctx.fillStyle = '#34d399'
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillText('FIT-CITY · Мерный рацион на день', padding, y)
  y += lineH + 4

  ctx.fillStyle = '#e2e8f0'
  ctx.font = '16px system-ui, sans-serif'
  if (meta.clientName) {
    ctx.fillText(String(meta.clientName), padding, y)
    y += lineH
  }
  const header = `~${plan.kcalTarget} ккал · ${plan.mealsPerDay} приёма · Б ${plan.macros?.proteinG} Ж ${plan.macros?.fatG} У ${plan.macros?.carbsG}`
  ctx.fillStyle = '#94a3b8'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText(header, padding, y)
  y += lineH + 12

  for (const meal of dayPlan) {
    ctx.fillStyle = '#6ee7b7'
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.fillText(meal.label ?? '', padding, y)
    y += lineH

    ctx.fillStyle = '#cbd5e1'
    ctx.font = '14px system-ui, sans-serif'
    for (const item of meal.items ?? []) {
      const line = `  ${item.label} — ${item.portionLabel ?? `${item.grams} г`}`
      ctx.fillText(line, padding, y)
      y += lineH
    }
    const st = meal.subtotal
    if (st) {
      ctx.fillStyle = '#64748b'
      ctx.font = '13px system-ui, sans-serif'
      ctx.fillText(`  Подытог: ${st.kcal} ккал · Б ${st.proteinG} Ж ${st.fatG} У ${st.carbsG}`, padding, y)
      y += lineH
    }
    y += mealGap
  }

  const tot = plan.totals
  if (tot) {
    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillText(`Итого: ${tot.kcal} ккал · Б ${tot.proteinG} Ж ${tot.fatG} У ${tot.carbsG}`, padding, y)
    y += lineH + 8
  }

  ctx.fillStyle = '#475569'
  ctx.font = '11px system-ui, sans-serif'
  const disc = plan.disclaimer ?? 'Ориентировочный рацион, не медицинское назначение.'
  wrapText(ctx, disc, padding, y, width - padding * 2, 14)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Не удалось создать изображение'))
    }, 'image/png')
  })
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ')
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y)
      y += lineHeight
      line = w
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, y)
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadNutritionPlanBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * @param {Blob} blob
 * @param {string} title
 */
export async function shareNutritionPlanBlob(blob, title) {
  const file = new File([blob], 'fit-city-racion.png', { type: 'image/png' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title })
    return true
  }
  return false
}
