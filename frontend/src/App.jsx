import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import Header from './components/Header.jsx'
import BookingPage from './pages/BookingPage.jsx'
import ConfirmPage from './pages/ConfirmPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import MainPage from './pages/MainPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import SuccessPage from './pages/SuccessPage.jsx'

// Динамический document.title по маршруту (тикет #28, спецификация #19, user story 46):
// скобка ADR-0001 про один статичный <title> закрыта решением карты шага 4. Статичный
// <title> в frontend/index.html остаётся заголовком главной — его сверяет rack-тест
// spa_catch_all. Карта точная по pathname: query-параметры маршрут не меняют,
// неизвестный путь — «Страница не найдена», как у catch-all ниже.
/** @type {Record<string, string>} */
const ROUTE_TITLES = {
  '/': 'Запись на звонок',
  '/booking': 'Записаться',
  '/booking/confirm': 'Записаться',
  '/booking/success': 'Записаться',
  '/events': 'Предстоящие события',
}

const NOT_FOUND_TITLE = 'Страница не найдена'

function DocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = ROUTE_TITLES[pathname] ?? NOT_FOUND_TITLE
  }, [pathname])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <Header />
      <DocumentTitle />
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/booking" element={<BookingPage />} />
        {/* Экран подтверждения: параметры type/date/start — в URL (тикеты #24, #25). */}
        <Route path="/booking/confirm" element={<ConfirmPage />} />
        {/* Экран успеха после 201 POST /api/bookings (тикет #25). */}
        <Route path="/booking/success" element={<SuccessPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
