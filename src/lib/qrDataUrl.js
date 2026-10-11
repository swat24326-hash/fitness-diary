/** Картинка QR (data:URL) для ссылки входа; библиотека грузится только когда QR нужен. */
export async function qrDataUrl(text) {
  const { default: qrcode } = await import('qrcode-generator')
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createDataURL(8, 4)
}
