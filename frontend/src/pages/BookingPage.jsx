import { Link } from 'react-router'

// Страница записи (GLOSSARY.md) — пока заглушка: выбор времени появится на шаге 5.
// Query-параметры (например, ?type=) страница сознательно игнорирует.
function BookingPage() {
  return (
    <main className="page">
      <h1>Страница записи</h1>
      <p>Выбор времени появится позже.</p>
      <p className="notice">
        <Link to="/">На главную</Link>
      </p>
    </main>
  )
}

export default BookingPage
