import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { apiGetAvailability } from '../sdk'
import { dayCaption } from '../lib/dates'

/** @typedef {import('../sdk').MeetingType} MeetingType */
/** @typedef {import('../sdk').Slot} Slot */

// Колонки слотов и информации выбранного дня (спецификация #19, тикет #24, user stories 7–10).
// Статусы «Свободно»/«Занято», интервалы и число свободных слотов — только из ответа
// GET /api/availability; до ответа — текст «Выберите дату в календаре.». Занятый слот
// некликабелен (клик по нему не выбирает), «Продолжить» неактивна, пока не выбран свободный
// слот, и ведёт на /booking/confirm с query-параметрами type/date/start — ссылка переживает
// refresh (user story 11), сам экран подтверждения — тикет #25. Компонент перемонтируется
// на странице записи по key с датой — смена дня сбрасывает выбор слота.

/** @param {{ type: MeetingType, date: string | null }} props */
function BookingSlots({ type, date }) {
  const navigate = useNavigate()
  const [slots, setSlots] = useState(/** @type {Slot[] | null} */ (null))
  const [selectedStart, setSelectedStart] = useState(/** @type {string | null} */ (null))

  useEffect(() => {
    if (date === null) return

    apiGetAvailability({ query: { date, meeting_type_id: type.id } }).then((response) => {
      setSlots(response.data?.slots ?? null)
    })
  }, [type.id, date])

  const selectedSlot = slots?.find((slot) => slot.start === selectedStart) ?? null
  const freeCount = slots?.filter((slot) => slot.available).length ?? null

  const goConfirm = () => {
    if (selectedSlot === null || date === null) return

    navigate(`/booking/confirm?type=${type.id}&date=${date}&start=${encodeURIComponent(selectedSlot.start)}`)
  }

  return (
    <div className="booking-side">
      <section className="day-slots" aria-label="Слоты">
        {slots === null ? (
          <p className="day-slots__placeholder">Выберите дату в календаре.</p>
        ) : (
          <div className="day-slots__list">
            {slots.map((slot) => (
              <button
                type="button"
                key={slot.start}
                className={`slot${selectedStart === slot.start ? ' slot--selected' : ''}`}
                disabled={!slot.available}
                onClick={() => setSelectedStart(slot.start)}
              >
                <span className="slot__time">{`${slot.start} - ${slot.end}`}</span>
                {' '}
                <span className="slot__status">{slot.available ? 'Свободно' : 'Занято'}</span>
              </button>
            ))}
          </div>
        )}

        <button type="button" className="day-slots__continue" disabled={selectedSlot === null} onClick={goConfirm}>
          Продолжить
        </button>
      </section>

      <section className="booking-info" aria-label="Информация">
        <dl className="booking-info__list">
          <div className="booking-info__item">
            <dt>Выбранная дата</dt>
            <dd>{date === null ? 'Дата не выбрана' : dayCaption(date)}</dd>
          </div>
          <div className="booking-info__item">
            <dt>Выбранное время</dt>
            <dd>{selectedSlot === null ? 'Время не выбрано' : `${selectedSlot.start} - ${selectedSlot.end}`}</dd>
          </div>
          <div className="booking-info__item">
            <dt>Свободно</dt>
            <dd>{freeCount === null ? '—' : String(freeCount)}</dd>
          </div>
          <div className="booking-info__item">
            <dt>Длительность</dt>
            <dd>{`${type.duration} мин`}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

export default BookingSlots
