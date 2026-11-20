import { BrowserRouter, Route, Routes } from 'react-router'
import Header from './components/Header.jsx'
import BookingPage from './pages/BookingPage.jsx'
import ConfirmPage from './pages/ConfirmPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import MainPage from './pages/MainPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import SuccessPage from './pages/SuccessPage.jsx'

function App() {
  return (
    <BrowserRouter>
      <Header />
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
