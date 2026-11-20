import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { apiListMeetingTypes } from '../sdk'
import BookingCalendar from '../components/BookingCalendar'
import BookingSlots from '../components/BookingSlots'

/** @typedef {import('../sdk').MeetingType} MeetingType */

// Страница записи (GLOSSARY.md): типы встреч приходят только из сгенерированного SDK —
// рукописный fetch к /api запрещён (спецификация #19). Пустое хранилище — одно пустое
// состояние; иначе карточки: название-ссылка выбора типа (/booking?type=…, доступное имя =
// название, тикет #32), описание, длительность «NN мин» (user story 2).
// С валидным ?type= — календарь окна со счётчиками (user stories 3–6, тикет #23) и слоты
// выбранного дня (тикет #24): выбранный день живёт здесь, а колонка слотов перемонтируется
// по key с датой — смена дня сбрасывает выбор слота. Без ?type= и с неизвестным ?type= —
// список типов, битая ссылка остаётся полезной (user story 19).
// Сетевые сбои при загрузке страницы согласованы вне объёма (Out of Scope спецификации).
function BookingPage() {
  const [searchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const [types, setTypes] = useState(/** @type {MeetingType[] | null} */ (null))
  // День можно принести ссылкой ?date= (переход «Изменить» с экрана подтверждения, #25);
  // выбор слота при этом свежий — состояние компонента, занятый слот не выделен.
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date'))

  useEffect(() => {
    apiListMeetingTypes().then((response) => {
      setTypes(response.data ?? [])
    })
  }, [])

  const selectedType = types?.find((type) => type.id === typeParam) ?? null

  return (
    <main className="page">
      <h1>Страница записи</h1>

      {types === null ? (
        <p>Загружаем типы встреч…</p>
      ) : selectedType ? (
        <div className="booking-flow">
          <BookingCalendar
            key={selectedType.id}
            type={selectedType}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <BookingSlots key={`${selectedType.id}:${selectedDate ?? ''}`} type={selectedType} date={selectedDate} />
        </div>
      ) : types.length === 0 ? (
        <p>Владелец ещё не завёл типы встреч. Загляните позже.</p>
      ) : (
        <div className="meeting-types">
          {types.map((type) => (
            <article className="meeting-type-card" key={type.id}>
              {/* Название — ссылка выбора типа: доступное имя ссылки = название типа (ADR-0002). */}
              <h2>
                <Link to={`/booking?type=${type.id}`}>{type.name}</Link>
              </h2>
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
