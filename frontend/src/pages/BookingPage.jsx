import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiListMeetingTypes } from '../sdk'

/** @typedef {import('../sdk').MeetingType} MeetingType */

// Страница записи (GLOSSARY.md): типы встреч приходят только из сгенерированного SDK —
// рукописный fetch к /api запрещён (спецификация #19). Пустое хранилище — одно пустое
// состояние; иначе карточки: название, описание, длительность «NN мин» (user story 2).
// Без ?type= и с неизвестным ?type= — список типов (user story 19); выбор известного
// ?type= (календарь и слоты) подключается в следующем тикете, здесь ?type= не меняет список.
// Сетевые сбои при загрузке страницы согласованы вне объёма (Out of Scope спецификации).
function BookingPage() {
  const [types, setTypes] = useState(/** @type {MeetingType[] | null} */ (null))

  useEffect(() => {
    apiListMeetingTypes().then((response) => {
      setTypes(response.data ?? [])
    })
  }, [])

  return (
    <main className="page">
      <h1>Страница записи</h1>

      {types === null ? (
        <p>Загружаем типы встреч…</p>
      ) : types.length === 0 ? (
        <p>Владелец ещё не завёл типы встреч. Загляните позже.</p>
      ) : (
        <div className="meeting-types">
          {types.map((type) => (
            <article className="meeting-type-card" key={type.id}>
              <h2>{type.name}</h2>
              <p className="meeting-type-card__description">{type.description}</p>
              <p className="meeting-type-card__duration">{type.duration} мин</p>
            </article>
          ))}
        </div>
      )}

      <p className="notice">
        <Link to="/">На главную</Link>
      </p>
    </main>
  )
}

export default BookingPage
