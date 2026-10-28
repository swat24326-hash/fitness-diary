/**
 * Пустой экран выкладки: контрастное цветовое поле и слоган «Сияй».
 * Без CSS blur / mix-blend (Samsung) и без border-radius на пятне.
 */
export function StoryComposeEmpty() {
  return (
    <div className="stories-compose__empty">
      <div className="stories-compose__empty-field" aria-hidden>
        <span className="stories-compose__empty-glow" />
        <span className="stories-compose__empty-glow stories-compose__empty-glow--b" />
      </div>
      <p className="stories-compose__slogan">Сияй</p>
    </div>
  )
}
