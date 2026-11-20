import { Link } from 'react-router'

// Глобальная шапка (тикет #28, спецификация #19, user story 23): сквозная навигация
// по сервису. Рисуется в App над Routes — есть на всех маршрутах, включая
// «Страница не найдена». Ссылки — обычные react-router Link (ADR-0001).
function Header() {
  return (
    <header className="app-header">
      <nav className="app-header__nav">
        <Link className="app-header__link" to="/booking">
          Записаться
        </Link>
        <Link className="app-header__link" to="/events">
          Предстоящие события
        </Link>
      </nav>
    </header>
  )
}

export default Header
