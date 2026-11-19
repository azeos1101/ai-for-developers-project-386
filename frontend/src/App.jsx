import { BrowserRouter, Route, Routes } from 'react-router'
import BookingPage from './pages/BookingPage.jsx'
import ConfirmPage from './pages/ConfirmPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import MainPage from './pages/MainPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/booking" element={<BookingPage />} />
        {/* Маршрут экрана подтверждения (тикет #24): параметры type/date/start — в URL. */}
        <Route path="/booking/confirm" element={<ConfirmPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
