import { useEffect, useState } from 'react'
import { apiGetAvailabilityDays } from '../sdk'
import { MONTHS_GENITIVE, MONTHS_NOMINATIVE, WEEKDAYS, dateKey, monthKey, parseDateKey } from '../lib/dates'

/** @typedef {import('../sdk').MeetingType} MeetingType */

// Календарь окна записи (спецификация #19, тикет #23, user stories 3–6). Счётчики «N св.»
// приезжают только из API GET /api/availability/days — на клиенте числа не вычисляются,
// границы окна тоже берутся из ответа. Отдельных спиннеров нет: сетка месяца (неделя с
// понедельника) рисуется сразу, бейджи доезжают с ответом. День окна кликабелен даже при
// нуле свободных слотов — так «всё занято» отличимо от «день недоступен»; прошедшие и
// внеоконные дни отключены. Стрелки переключения месяцев блокируются на границах окна.
// Выбор дня живёт на странице записи (тикет #24): клик сообщается наверх onSelectDate,
// а выбранный день подсвечивается пропом selectedDate.

/** Ключ `YYYY-MM-DD` → Date для стартовой даты окна. */
function buildMonthCells(/** @type {Date} */ monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const weekdayOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cellCount = Math.ceil((weekdayOffset + daysInMonth) / 7) * 7

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(year, month, 1 - weekdayOffset + index)
    return { date, key: dateKey(date) }
  })
}

/**
 * @param {{
 *   type: MeetingType,
 *   selectedDate: string | null,
 *   onSelectDate: (date: string) => void,
 * }} props
 */
function BookingCalendar({ type, selectedDate, onSelectDate }) {
  // Счётчики по дням и границы окна — только из API; до ответа счётчиков нет и ни один
  // день не считается днём окна (сетка видна сразу, но некликабельна). Смена типа
  // перемонтирует компонент по key на странице записи, состояние стартовое не устаревает.
  const [counts, setCounts] = useState(/** @type {Record<string, number>} */ ({}))
  const [windowDays, setWindowDays] = useState(/** @type {{ start: string, end: string } | null} */ (null))
  const [monthDate, setMonthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  useEffect(() => {
    apiGetAvailabilityDays({ query: { meeting_type_id: type.id } }).then((response) => {
      const summary = response.data
      if (!summary || summary.days.length === 0) return

      setCounts(Object.fromEntries(summary.days.map((day) => [day.date, day.available_count])))
      setWindowDays({ start: summary.days[0].date, end: summary.days[summary.days.length - 1].date })
      setMonthDate(parseDateKey(summary.days[0].date))
    })
  }, [type.id])

  const shownMonth = monthKey(monthDate)
  const canGoPrev = windowDays !== null && shownMonth > windowDays.start.slice(0, 7)
  const canGoNext = windowDays !== null && shownMonth < windowDays.end.slice(0, 7)

  const shiftMonth = (/** @type {number} */ months) =>
    setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + months, 1))

  return (
    <section className="calendar" aria-label="Календарь">
      <div className="calendar__header">
        <button
          type="button"
          className="calendar__arrow"
          aria-label="Предыдущий месяц"
          disabled={!canGoPrev}
          onClick={() => shiftMonth(-1)}
        >
          ←
        </button>
        <h2>{`${MONTHS_NOMINATIVE[monthDate.getMonth()]} ${monthDate.getFullYear()} г.`}</h2>
        <button
          type="button"
          className="calendar__arrow"
          aria-label="Следующий месяц"
          disabled={!canGoNext}
          onClick={() => shiftMonth(1)}
        >
          →
        </button>
      </div>

      <div className="calendar__weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="calendar__grid">
        {buildMonthCells(monthDate).map(({ date, key }) => {
          const inWindow = windowDays !== null && key >= windowDays.start && key <= windowDays.end
          const count = counts[key] ?? 0
          const selected = selectedDate === key

          return (
            <button
              type="button"
              key={key}
              className={`calendar__day${selected ? ' calendar__day--selected' : ''}`}
              aria-label={`${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`}
              disabled={!inWindow}
              onClick={() => onSelectDate(key)}
            >
              <span className="calendar__day-number">{date.getDate()}</span>
              {inWindow && count > 0 ? <span className="calendar__badge">{`${count} св.`}</span> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default BookingCalendar
