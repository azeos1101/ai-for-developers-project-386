// Экран подтверждения — заглушка тикета #24: зафиксирован маршрут и получение типа, даты
// и начала из query-параметров URL (спецификация #19, user story 11). Форма с именем/email
// и бронь через POST /api/bookings — тикет #25.
import { Link } from 'react-router'

function ConfirmPage() {
  return (
    <main className="page">
      <h1>Подтверждение записи</h1>

      <p>Дата и время выбраны, форма подтверждения появится следующим шагом.</p>

      <p className="notice">
        <Link to="/booking">Назад к выбору</Link>
      </p>
    </main>
  )
}

export default ConfirmPage
