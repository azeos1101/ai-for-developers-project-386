import { Link, useSearchParams } from 'react-router'

// Экран успеха (GLOSSARY.md), тикет #25, спецификация #19: строго «Бронь подтверждена.
// До встречи!» и «Забронировать ещё»; детали брони не показываем (user story 17).
// «Забронировать ещё» — страница записи с тем же типом, выбор сброшен, счётчики приезжают
// свежим запросом при обычном переходе (user story 18).

function SuccessPage() {
  const [searchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const againHref = typeParam !== null ? `/booking?type=${typeParam}` : '/booking'

  return (
    <main className="page">
      <h1>Бронь подтверждена. До встречи!</h1>

      <p className="notice">
        <Link to={againHref}>Забронировать ещё</Link>
      </p>
    </main>
  )
}

export default SuccessPage
