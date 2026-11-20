import { useEffect, useState } from 'react'
import { apiCreateMeetingType, apiListBookings, apiListMeetingTypes } from '../sdk'

/** @typedef {import('../sdk').Booking} Booking */
/** @typedef {import('../sdk').MeetingType} MeetingType */

// Страница предстоящих событий (GLOSSARY.md), тикеты #22 и #27: блок карточек броней —
// первым, затем блок управления типами (форма создания и список типов). Карточка брони
// рисуется ровно в составе и порядке ответа GET /api/bookings — никакой клиентской
// сортировки и фильтрации (user story 31, тикет #27). К API — только через SDK.
// Тексты баннеров и пустых состояний фиксированы спецификацией #19; серверный message
// гостю не показываем.

// Момент создания брони показываем временем сервиса — Europe/Moscow (фиксированный UTC+3,
// та же константа, что в серверном SlotGrid); строка «Создано: DD.MM.YYYY, HH:MM».
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

/** created_at (ISO 8601) → «DD.MM.YYYY, HH:MM» по Europe/Moscow. */
function createdCaption(/** @type {string} */ createdAtIso) {
  const moscow = new Date(new Date(createdAtIso).getTime() + MOSCOW_OFFSET_MS)
  /** @param {number} value */
  const pad = (value) => String(value).padStart(2, '0')

  return (
    `${pad(moscow.getUTCDate())}.${pad(moscow.getUTCMonth() + 1)}.${moscow.getUTCFullYear()}, ` +
    `${pad(moscow.getUTCHours())}:${pad(moscow.getUTCMinutes())}`
  )
}

// Select длительности: от 30 до 240 минут включительно шагом 30 (правило контракта).
const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240]

const EMPTY_FORM = { id: '', name: '', description: '', duration: '30' }

// Клиентские проверки — ровно правила контракта (contract/main.tsp): slug `^[a-z0-9-]{1,64}$`,
// name ≥ 1 символ, duration — только значения из select. Ничего сверх контракта не выдумываем.
const ID_PATTERN = /^[a-z0-9-]{1,64}$/

const ID_ERROR = 'Введите id: только строчные латинские буквы, цифры и дефис, до 64 символов'
const NAME_ERROR = 'Введите название'
const DURATION_ERROR = 'Выберите длительность из списка'

/** @typedef {Partial<Record<'id' | 'name' | 'duration', string>>} FieldErrors */

/**
 * @param {typeof EMPTY_FORM} values
 * @returns {FieldErrors}
 */
function validateForm(values) {
  /** @type {FieldErrors} */
  const errors = {}
  if (!ID_PATTERN.test(values.id)) {
    errors.id = ID_ERROR
  }
  if (values.name.length < 1) {
    errors.name = NAME_ERROR
  }
  if (!DURATION_OPTIONS.includes(Number(values.duration))) {
    errors.duration = DURATION_ERROR
  }
  return errors
}

const CONFLICT_BANNER = 'Тип с таким id уже существует.'
const VALIDATION_BANNER = 'Не удалось создать тип встречи. Проверьте поля.'
const NETWORK_BANNER = 'Не удалось создать тип встречи. Попробуйте ещё раз.'

function EventsPage() {
  const [types, setTypes] = useState(/** @type {MeetingType[] | null} */ (null))
  const [bookings, setBookings] = useState(/** @type {Booking[] | null} */ (null))
  const [form, setForm] = useState(EMPTY_FORM)
  const [banner, setBanner] = useState(/** @type {string | null} */ (null))
  const [idHighlighted, setIdHighlighted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState(/** @type {FieldErrors} */ ({}))
  // После первой отправки изменённые поля перепроверяются на вводе (спецификация #19).
  const [everSubmitted, setEverSubmitted] = useState(false)

  useEffect(() => {
    apiListMeetingTypes().then((response) => {
      setTypes(response.data ?? [])
    })
  }, [])

  // Порядок и состав карточек — как пришли из apiListBookings (user story 41): список
  // кладётся в состояние без изменений, прошедшие брони уже отфильтрованы сервером.
  useEffect(() => {
    apiListBookings().then((response) => {
      setBookings(response.data ?? [])
    })
  }, [])

  /**
   * @param {keyof typeof EMPTY_FORM} field
   * @returns {(event: { target: { value: string } }) => void}
   */
  function updateField(field) {
    return (event) => {
      const nextForm = { ...form, [field]: event.target.value }
      setForm(nextForm)
      if (everSubmitted) {
        setErrors(validateForm(nextForm))
      }
    }
  }

  /** @param {{ preventDefault: () => void }} event */
  async function submitType(event) {
    event.preventDefault()
    setEverSubmitted(true)

    const fieldErrors = validateForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      // Клиентская ошибка поля — запрос на сервер не уходит вовсе.
      return
    }

    setSubmitting(true)
    setBanner(null)
    setIdHighlighted(false)

    const response = await apiCreateMeetingType({
      body: {
        id: form.id,
        name: form.name,
        description: form.description,
        duration: Number(form.duration),
      },
    })
    setSubmitting(false)

    const created = response.data
    if (created !== undefined && created !== null) {
      // 201: форма очищается, тип дописывается в список из тела ответа — без рефетча.
      setTypes((current) => (current === null ? [created] : [...current, created]))
      setForm(EMPTY_FORM)
      setEverSubmitted(false)
      setErrors({})
    } else if (response.response?.status === 409) {
      setBanner(CONFLICT_BANNER)
      setIdHighlighted(true)
    } else if (response.response?.status === 422) {
      setBanner(VALIDATION_BANNER)
    } else {
      setBanner(NETWORK_BANNER)
    }
  }

  return (
    <main className="page events-page">
      <section className="events-block" aria-label="Предстоящие события">
        {bookings === null ? (
          <p>Загружаем предстоящие события…</p>
        ) : bookings.length === 0 ? (
          <p>Предстоящих событий пока нет.</p>
        ) : (
          bookings.map((booking) => (
            <article className="booking-card" key={booking.id}>
              <h2 className="booking-card__name">{booking.name}</h2>
              <p className="booking-card__email">{booking.email}</p>
              <p className="booking-card__slot">Слот: {booking.date}-{booking.start}</p>
              <p className="booking-card__created">Создано: {createdCaption(booking.created_at)}</p>
              <p className="booking-card__type">
                {booking.meeting_type_name} · {booking.duration} мин
              </p>
            </article>
          ))
        )}
      </section>

      <form className="events-block events-form" aria-label="Создание типа встречи" onSubmit={submitType}>
        {banner !== null ? (
          <p className="events-form__banner" role="alert">
            {banner}
          </p>
        ) : null}

        <label className="events-form__label" htmlFor="meeting-type-id">
          id
        </label>
        <input
          className="events-form__field"
          id="meeting-type-id"
          placeholder="intro-call"
          value={form.id}
          onChange={updateField('id')}
          aria-invalid={idHighlighted || errors.id !== undefined ? 'true' : undefined}
          aria-describedby={errors.id !== undefined ? 'meeting-type-id-error' : undefined}
        />
        {errors.id !== undefined ? (
          <p className="events-form__error" id="meeting-type-id-error">
            {errors.id}
          </p>
        ) : null}

        <label className="events-form__label" htmlFor="meeting-type-name">
          Название
        </label>
        <input
          className="events-form__field"
          id="meeting-type-name"
          value={form.name}
          onChange={updateField('name')}
          aria-invalid={errors.name !== undefined ? 'true' : undefined}
          aria-describedby={errors.name !== undefined ? 'meeting-type-name-error' : undefined}
        />
        {errors.name !== undefined ? (
          <p className="events-form__error" id="meeting-type-name-error">
            {errors.name}
          </p>
        ) : null}

        <label className="events-form__label" htmlFor="meeting-type-description">
          Описание
        </label>
        <input
          className="events-form__field"
          id="meeting-type-description"
          value={form.description}
          onChange={updateField('description')}
        />

        <label className="events-form__label" htmlFor="meeting-type-duration">
          Длительность
        </label>
        <select
          className="events-form__field"
          id="meeting-type-duration"
          value={form.duration}
          onChange={updateField('duration')}
          aria-invalid={errors.duration !== undefined ? 'true' : undefined}
          aria-describedby={errors.duration !== undefined ? 'meeting-type-duration-error' : undefined}
        >
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={String(minutes)}>
              {minutes} мин
            </option>
          ))}
        </select>
        {errors.duration !== undefined ? (
          <p className="events-form__error" id="meeting-type-duration-error">
            {errors.duration}
          </p>
        ) : null}

        <button className="button" type="submit" disabled={submitting}>
          Создать тип встречи
        </button>
      </form>

      <section className="events-block" aria-label="Типы встреч">
        {types === null ? (
          <p>Загружаем типы встреч…</p>
        ) : types.length === 0 ? (
          <p>Типы встреч ещё не заведены — создайте первый тип ниже.</p>
        ) : (
          types.map((type) => (
            <article className="event-type-card" key={type.id}>
              <h2 className="event-type-card__title">
                {type.name} <span className="event-type-card__duration">{type.duration} мин</span>
              </h2>
              <p className="event-type-card__id">{type.id}</p>
              <p className="event-type-card__description">{type.description}</p>
            </article>
          ))
        )}
      </section>
    </main>
  )
}

export default EventsPage
