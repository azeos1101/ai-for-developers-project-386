import { Link } from 'react-router'

// ADR-0001: неизвестные маршруты рисует фронтенд — «Страница не найдена» со ссылкой на главную.
function NotFoundPage() {
  return (
    <main className="page">
      <h1>Страница не найдена</h1>
      <p>Такой страницы нет — начните с главной.</p>
      <p className="notice">
        <Link to="/">На главную</Link>
      </p>
    </main>
  )
}

export default NotFoundPage
