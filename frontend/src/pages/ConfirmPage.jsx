import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { apiCreateBooking, apiListMeetingTypes } from '../sdk'
import { dayCaption, parseDateKey, dateKey } from '../lib/dates'

/** @typedef {import('../sdk').MeetingType} MeetingType */

// Экран подтверждения (GLOSSARY.md), тикет #25, спецификация #19: тип, дата и начало
// берутся из query-параметров URL — ссылка переживает refresh (user story 11); битые
// type/date/start ведут редирект на страницу записи, валидный type сохраняем (user story 20).
// Клиентские проверки — ровно правила контракта (name ≥ 1, email ≥ 3, значения не тримятся),
// подсказки из спецификации; проверка при submit, после первой отправки изменённые поля
// перепроверяются на вводе. Кнопка блокируется на время запроса (user story 14). При отказе
// остаёмся на экране с баннером спецификации, имя и email сохранены; нигде они не персистятся
// — уход с экрана очищает форму (user story 15). Баннер 409 «время занято» — тикет #26,
// авто-возврата на страницу записи нет. К API — только через сгенерированный SDK.

// Клиентские проверки — ровно правила контракта; ничего сверх не выдумываем.
const NAME_ERROR = 'Введите имя'
const EMAIL_ERROR = 'Введите email (не короче 3 символов)'

// Баннеры фиксированы спецификацией #19; серверный message гостю не показываем.
const VALIDATION_BANNER = 'Записаться на это время не получилось. Выберите другое время.'
const CONFLICT_BANNER = 'Это время уже занято. Выберите другое время.'
const NETWORK_BANNER = 'Не удалось отправить запись. Попробуйте ещё раз.'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const START_PATTERN = /^\d{2}:\d{2}$/

/** Дата-параметр: существующий календарный день в формате YYYY-MM-DD (окно проверит сервер). */
function isValidDateKey(/** @type {string | null} */ value) {
  if (value === null || !DATE_PATTERN.test(value)) return false

  return dateKey(parseDateKey(value)) === value
}

/** Старт-параметр: HH:MM на сетке 30 минут — минуты только :00/:30 (09:60 не бывает);
 *  глубже — дело сервера: сетка, часы, прошлое. */
function isValidStart(/** @type {string | null} */ value) {
  if (value === null || !START_PATTERN.test(value)) return false

  const hour = Number(value.slice(0, 2))
  const minute = Number(value.slice(3, 5))

  return hour <= 23 && (minute === 0 || minute === 30)
}

/** Интервал слота «HH:MM - HH:MM»: старт + длительность типа в минутах. */
function slotInterval(/** @type {string} */ start, /** @type {number} */ durationMin) {
  const [hour, minute] = start.split(':').map(Number)
  const endTotal = hour * 60 + minute + durationMin
  const endHour = String(Math.floor(endTotal / 60)).padStart(2, '0')
  const endMinute = String(endTotal % 60).padStart(2, '0')

  return `${start} - ${endHour}:${endMinute}`
}

/** @param {{ name: string, email: string }} values */
function validateFields(values) {
  /** @type {Partial<Record<'name' | 'email', string>>} */
  const errors = {}
  if (values.name.length < 1) {
    errors.name = NAME_ERROR
  }
  if (values.email.length < 3) {
    errors.email = EMAIL_ERROR
  }
  return errors
}

function ConfirmPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const typeParam = searchParams.get('type')
  const dateParam = searchParams.get('date')
  const startParam = searchParams.get('start')

  const [types, setTypes] = useState(/** @type {MeetingType[] | null} */ (null))
  const [form, setForm] = useState({ name: '', email: '' })
  const [banner, setBanner] = useState(/** @type {string | null} */ (null))
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState(/** @type {Partial<Record<'name' | 'email', string>>} */ ({}))
  // После первой отправки изменённые поля перепроверяются на вводе (спецификация #19).
  const [everSubmitted, setEverSubmitted] = useState(false)

  useEffect(() => {
    apiListMeetingTypes().then((response) => {
      setTypes(response.data ?? [])
    })
  }, [])

  const selectedType = types?.find((type) => type.id === typeParam) ?? null
  const validDate = isValidDateKey(dateParam)
  const validStart = isValidStart(startParam)

  // Битые параметры — редирект на страницу записи; ждём список типов, чтобы не спутать
  // загрузку с неизвестным типом (user story 20).
  if (types !== null && (selectedType === null || !validDate || !validStart)) {
    const keepType = selectedType !== null ? `?type=${selectedType.id}` : ''
    const keepDate = keepType !== '' && validDate ? `&date=${dateParam}` : ''

    return <Navigate to={`/booking${keepType}${keepDate}`} replace />
  }

  /** @param {'name' | 'email'} field */
  function updateField(field) {
    return (/** @type {{ target: { value: string } }} */ event) => {
      const nextForm = { ...form, [field]: event.target.value }
      setForm(nextForm)
      if (everSubmitted) {
        setErrors(validateFields(nextForm))
      }
    }
  }

  /** @param {{ preventDefault: () => void }} event */
  async function submitBooking(event) {
    event.preventDefault()
    setEverSubmitted(true)

    const fieldErrors = validateFields(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      // Клиентская ошибка поля — запрос на сервер не уходит вовсе.
      return
    }

    if (selectedType === null || dateParam === null || startParam === null) return

    setSubmitting(true)
    setBanner(null)

    const response = await apiCreateBooking({
      body: {
        meeting_type_id: selectedType.id,
        name: form.name,
        email: form.email,
        date: dateParam,
        start: startParam,
      },
    })
    setSubmitting(false)

    const created = response.data
    if (created !== undefined && created !== null) {
      // 201: экран успеха; детали брони там не показываем.
      navigate(
        `/booking/success?type=${selectedType.id}&date=${dateParam}&start=${encodeURIComponent(startParam)}`,
      )
    } else if (response.response?.status === 422) {
      setBanner(VALIDATION_BANNER)
    } else if (response.response?.status === 409) {
      // Конфликт слота (тикет #26): остаёмся на экране, имя и email сохранены,
      // авто-возврата нет — гость сам выбирает другое время.
      setBanner(CONFLICT_BANNER)
    } else {
      // Сетевой сбой и прочие отказы — баннер сбоя.
      setBanner(NETWORK_BANNER)
    }
  }

  if (types === null || selectedType === null || dateParam === null || startParam === null) {
    return (
      <main className="page">
        <h1>Подтверждение записи</h1>
        <p>Загружаем выбор…</p>
      </main>
    )
  }

  return (
    <main className="page">
      <h1>Подтверждение записи</h1>

      <section className="booking-info" aria-label="Информация">
        <dl className="booking-info__list">
          <div className="booking-info__item">
            <dt>Тип встречи</dt>
            <dd>{selectedType.name}</dd>
          </div>
          <div className="booking-info__item">
            <dt>Дата</dt>
            <dd>{dayCaption(dateParam)}</dd>
          </div>
          <div className="booking-info__item">
            <dt>Время</dt>
            <dd>{slotInterval(startParam, selectedType.duration)}</dd>
          </div>
        </dl>
      </section>

      <form className="confirm-form" aria-label="Подтверждение записи" onSubmit={submitBooking}>
        {banner !== null ? (
          <p className="confirm-form__banner" role="alert">
            {banner}
          </p>
        ) : null}

        <label className="confirm-form__label" htmlFor="booking-name">
          Имя
        </label>
        <input
          className="confirm-form__field"
          id="booking-name"
          value={form.name}
          onChange={updateField('name')}
          aria-invalid={errors.name !== undefined ? 'true' : undefined}
          aria-describedby={errors.name !== undefined ? 'booking-name-error' : undefined}
        />
        {errors.name !== undefined ? (
          <p className="confirm-form__error" id="booking-name-error">
            {errors.name}
          </p>
        ) : null}

        <label className="confirm-form__label" htmlFor="booking-email">
          Email
        </label>
        <input
          className="confirm-form__field"
          id="booking-email"
          value={form.email}
          onChange={updateField('email')}
          aria-invalid={errors.email !== undefined ? 'true' : undefined}
          aria-describedby={errors.email !== undefined ? 'booking-email-error' : undefined}
        />
        {errors.email !== undefined ? (
          <p className="confirm-form__error" id="booking-email-error">
            {errors.email}
          </p>
        ) : null}

        <button className="button" type="submit" disabled={submitting}>
          Подтвердить запись
        </button>

        <p className="notice">
          <Link to={`/booking?type=${selectedType.id}&date=${dateParam}`}>Изменить</Link>
        </p>
      </form>
    </main>
  )
}

export default ConfirmPage
