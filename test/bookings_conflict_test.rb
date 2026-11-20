# frozen_string_literal: true

require_relative 'test_helper'

# POST /api/bookings — правило пересечения интервалов (спецификация #19, user story 15,
# тикет #26). Фикстура по букве задания: бронь 60 минут в 10:00 ⇒ бронь 30 минут в 10:30
# отклоняется с 409 conflict, а бронь в 11:00 (примыкание end == start разрешено) проходит
# со 201. Пересечение считается по календарной дате с любой бронью любого типа. Ответы
# сверяет комитет по openapi/openapi.yaml, в том числе форму тела 409 {code, message};
# отклонённая попытка не оставляет брони в хранилище. Даты — день на +2 от сегодня
# по Moscow: весь день в будущем, прогон не зависит от часов.
class BookingsConflictTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
    create_type(id: 'consult', duration: 60)
    create_type(id: 'call', duration: 30)
    book(start: '10:00')
  end

  def test_partial_overlap_with_existing_booking_returns_conflict
    post_booking(meeting_type_id: 'call', start: '10:30')

    assert_equal 409, last_response.status
    assert_equal 'conflict', JSON.parse(last_response.body)['code']
    # Отклонённая попытка ничего не записывает: в хранилище только исходная бронь.
    assert_equal 1, App.settings.store.bookings.length
  end

  def test_booking_touching_the_end_of_existing_one_is_allowed
    post_booking(meeting_type_id: 'call', start: '11:00')

    assert_equal 201, last_response.status
    assert_equal '11:30', JSON.parse(last_response.body)['end']
    assert_equal 2, App.settings.store.bookings.length
  end

  private

  def create_type(id:, duration:)
    post_json '/api/meeting-types', { id: id, name: 'Созвон', description: '', duration: duration }

    assert_equal 201, last_response.status
  end

  # Успешная бронь consult на корректный слот +2 дней — фикстура пересечения.
  def book(**overrides)
    post_booking(**overrides)

    assert_equal 201, last_response.status
  end

  # POST /api/bookings на корректный слот +2 дней; вызывающий тест подменяет поля.
  def post_booking(**overrides)
    input = {
      meeting_type_id: 'consult',
      name: 'Иван',
      email: 'ivan@example.com',
      date: moscow_date(2),
      start: '10:00'
    }.merge(overrides)

    post_json '/api/bookings', input
  end

  # Дата окна на offset дней от сегодняшнего дня по Moscow (окно начинается сегодня).
  def moscow_date(offset)
    ((Time.now.getutc + MOSCOW_UTC_OFFSET) + (offset * 24 * 3600)).strftime('%Y-%m-%d')
  end
end
