import { Link } from 'react-router'

// Главная страница: шапка с названием сервиса и герой с призывом записаться (GLOSSARY.md).
function MainPage() {
  return (
    <>
      <header className="site-header">
        <Link className="site-header__brand" to="/">
          Запись на звонок
        </Link>
      </header>
      <main className="hero">
        <h1>Запись на звонок</h1>
        <p>
          Выберите тип встречи и свободное время в ближайшие 14 дней. Регистрация не нужна —
          достаточно имени и email.
        </p>
        <Link className="button" to="/booking">
          Записаться →
        </Link>
      </main>
    </>
  )
}

export default MainPage
