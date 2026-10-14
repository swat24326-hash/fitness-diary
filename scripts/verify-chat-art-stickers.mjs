/**
 * Анимированные стикеры набора «Зал»: id проходит сервер и CHECK в БД, файл рисунка на месте,
 * карты смещения двигают только нужную часть рисунка (остальное — 128 = на месте).
 * node scripts/verify-chat-art-stickers.mjs
 */
import fs from 'fs'
import { ART_MAPS, buildArtMapPixels } from '../src/lib/chat/chatArtStickerMaps.js'
import { CHAT_STICKERS, isChatArtSticker, isChatSticker, resolveChatOutgoing } from '../src/lib/chat/chatStickerCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  }
}

const art = CHAT_STICKERS.filter((s) => s.art)
ok(art.length === 5, 'в наборе «Зал» пять стикеров')
for (const s of art) {
  ok(/^[a-z0-9-]{1,32}$/.test(s.id), `${s.id}: id проходит CHECK колонки sticker`)
  ok(s.group === 'gym', `${s.id}: группа «Зал»`)
  ok(fs.existsSync(`public/stickers/art/${s.id}.webp`), `${s.id}: есть public/stickers/art/${s.id}.webp`)
  const out = resolveChatOutgoing({ sticker: s.id, body: 'подмена' })
  ok(out.ok && out.sticker === s.id && out.body === s.label, `${s.id}: сервер принимает, текст — подпись`)
}
ok(fs.existsSync('public/stickers/art/shake-shaker.webp'), 'шейкер — отдельный файл')
ok(isChatSticker('late') && !isChatArtSticker('late'), 'старые стикеры остались векторными')
ok(isChatArtSticker('strut') && !isChatArtSticker('nope'), 'признак растрового стикера')
ok(new Set(CHAT_STICKERS.map((s) => s.id)).size === CHAT_STICKERS.length, 'id стикеров не повторяются')

const px = (name, x, y) => {
  const m = buildArtMapPixels(name)
  const i = (y * m.w + x) * 4
  return [m.data[i], m.data[i + 1]]
}
const still = ([r, g]) => r === 128 && g === 128

ok(buildArtMapPixels('nope') === null, 'неизвестная карта — null')
for (const name of Object.keys(ART_MAPS)) {
  const m = buildArtMapPixels(name)
  ok(m.data.length === m.w * m.h * 4, `${name}: размер`)
  ok(still(px(name, 0, m.h - 1)), `${name}: низ-левый угол на месте`)
}
ok(px('dance-x', 0, 150)[0] > 200 && still(px('dance-x', 0, 270)), 'танец: бёдра двигаются, колени на месте')
ok(still(px('shake-arm', 150, 250)) && px('shake-arm', 92, 160)[1] > 200, 'шейкер: стенка на месте, рука у стенки двигается')
const arm = px('shake-arm', 92, 160)
ok(arm[0] < 128 && arm[1] > 128, 'шейкер: рука по диагонали (x и y в противоположные стороны)')
ok(px('shake-arm', 125, 145)[1] < 190, 'шейкер: грудь у руки почти не тянется')
ok(px('no-legs-yaw', 151, 70)[0] === 255 && still(px('no-legs-yaw', 151 + 34, 70)), 'утка: лицо сдвигается, контур головы на месте')
ok(px('no-legs-yaw', 138, 63)[0] === 255 && px('no-legs-yaw', 165, 84)[0] === 255, 'утка: глаз и клюв сдвигаются целиком')
ok(still(px('no-legs-legs', 150, 150)) && px('no-legs-legs', 129, 229)[0] > 200, 'утка: тело на месте, голени дрожат')
const handL = px('strut-arms', 86, 172)
const handR = px('strut-arms', 216, 180)
ok(handL[0] > 200 && handR[0] < 56, 'походка: руки в противофазе')
ok(still(px('strut-arms', 150, 150)), 'походка: грудь (тату) на месте')

if (failed) {
  console.error(`\nverify-chat-art-stickers: ${failed} FAIL`)
  process.exit(1)
}
console.log('verify-chat-art-stickers: OK')
