// Общие календарные утилиты страницы записи (тикеты #23, #24): подписи месяцев и ключи
// дней `YYYY-MM-DD` — единый формат с датами из API.

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

export const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

/** Ключ дня `YYYY-MM-DD` для сравнения с датами окна из API. */
export function dateKey(/** @type {Date} */ date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Ключ месяца `YYYY-MM` для границы окна записи. */
export function monthKey(/** @type {Date} */ date) {
  return dateKey(date).slice(0, 7)
}

/** Ключ `YYYY-MM-DD` → Date для стартовой даты окна. */
export function parseDateKey(/** @type {string} */ key) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Человекочитаемая подпись дня для колонки информации: «22 ноября 2026 г.». */
export function dayCaption(/** @type {string} */ key) {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const day = Number(key.slice(8, 10))
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year} г.`
}
