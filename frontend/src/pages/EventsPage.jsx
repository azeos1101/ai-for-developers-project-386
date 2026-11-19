import { useEffect, useState } from 'react'
import { apiCreateMeetingType, apiListMeetingTypes } from '../sdk'

/** @typedef {import('../sdk').MeetingType} MeetingType */

// Страница предстоящих событий (GLOSSARY.md), тикет #22: пока два блока — форма создания
// типа встречи и список типов. Бронирований и карточек здесь ещё нет (следующие тикеты),
// как и глобальной шапки с заголовками страниц. К API — только через сгенерированный SDK.
// Тексты баннеров фиксированы спецификацией #19; серверный message гостю не показываем.

// Select длительности: от 30 до 240 минут включительно шагом 30 (правило контракта).
const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240]

const EMPTY_FORM = { id: '', name: '', description: '', duration: '30' }

const CONFLICT_BANNER = 'Тип с таким id уже существует.'
const VALIDATION_BANNER = 'Не удалось создать тип встречи. Проверьте поля.'
const NETWORK_BANNER = 'Не удалось создать тип встречи. Попробуйте ещё раз.'

function EventsPage() {
  const [types, setTypes] = useState(/** @type {MeetingType[] | null} */ (null))
  const [form, setForm] = useState(EMPTY_FORM)
  const [banner, setBanner] = useState(/** @type {string | null} */ (null))
  const [idHighlighted, setIdHighlighted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiListMeetingTypes().then((response) => {
      setTypes(response.data ?? [])
    })
  }, [])

  /**
   * @param {string} field
   * @returns {(event: { target: { value: string } }) => void}
   */
  function updateField(field) {
    return (event) => setForm({ ...form, [field]: event.target.value })
  }

  /** @param {{ preventDefault: () => void }} event */
  async function submitType(event) {
    event.preventDefault()
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
          aria-invalid={idHighlighted ? 'true' : undefined}
        />

        <label className="events-form__label" htmlFor="meeting-type-name">
          Название
        </label>
        <input
          className="events-form__field"
          id="meeting-type-name"
          value={form.name}
          onChange={updateField('name')}
        />

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
        >
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={String(minutes)}>
              {minutes} мин
            </option>
          ))}
        </select>

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
