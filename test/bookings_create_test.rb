# frozen_string_literal: true

require 'time'

require_relative 'test_helper'

# POST /api/bookings — успешная бронь свободного слота (спецификация #19, user story 12,
# тикет #25): 201 Booking с полным телом. Формат ответа сверяет комитет по
# openapi/openapi.yaml, тест проверяет денормализованные и вычисленные поля по правилам:
# meeting_type_name — название созданного типа, end = start + длительность, id целый и
# последовательный, created_at — ISO 8601 прогона. Даты берутся относительно «сейчас»
# по Moscow; день на +2 — всегда будущий, поэтому прогон не зависит от часов. Пересечения
# здесь ещё не проверяются — их добавит следующий тикет.
class BookingsCreateTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600

  # Ожидаемое тело 201 — фикстура правил, а не реализации: end = 10:00 + 60 минут = 11:00,
  # meeting_type_name — денормализованное название созданного типа, id = 1 после reset!.
  # Дата в merge подставляется динамически: окно считается относительно «сейчас».
  EXPECTED_BOOKING = {
    'id' => 1,
    'meeting_type_id' => 'consult',
    'meeting_type_name' => 'Консультация',
    'duration' => 60,
    'name' => 'Анна Петрова',
    'email' => 'anna@example.com',
    'start' => '10:00',
    'end' => '11:00'
  }.freeze

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
  end

  def test_valid_booking_returns_full_booking_payload
    create_consult_type(name: 'Консультация')

    post_json '/api/bookings', booking_input(name: 'Анна Петрова', email: 'anna@example.com')

    assert_equal 201, last_response.status

    body = JSON.parse(last_response.body)

    assert_equal EXPECTED_BOOKING.merge('date' => moscow_date(2)), body.except('created_at')
    assert_created_at_now body['created_at']
  end

  def test_booking_ids_are_sequential_integers
    create_consult_type(name: 'Консультация')

    first_id = book(start: '10:00')
    second_id = book(start: '11:00')

    assert_equal [1, 2], [first_id, second_id]
  end

  def test_whitespace_values_are_not_trimmed_and_stay_valid
    create_consult_type(name: 'Консультация')

    # Решение контракта: name ≥ 1 и email ≥ 3 без трима — « » валидно как имя,
    # «x@ » — три символа в email; сервер сохраняет значения дословно.
    post_json '/api/bookings', booking_input(name: ' ', email: 'x@ ')

    assert_equal 201, last_response.status

    body = JSON.parse(last_response.body)

    assert_equal ' ', body['name']
    assert_equal 'x@ ', body['email']
  end

  private

  def create_consult_type(name:)
    post_json '/api/meeting-types', { id: 'consult', name: name, description: '', duration: 60 }

    assert_equal 201, last_response.status
  end

  # Корректный BookingInput на слот +2 дней в 10:00; вызывающий тест подменяет поля.
  def booking_input(**overrides)
    {
      meeting_type_id: 'consult',
      name: 'Иван',
      email: 'ivan@example.com',
      date: moscow_date(2),
      start: '10:00'
    }.merge(overrides)
  end

  # Успешная бронь слота: комитет сверяет тело Booking, тест возвращает id.
  def book(start:)
    post_json '/api/bookings', booking_input(start: start)

    assert_equal 201, last_response.status

    JSON.parse(last_response.body)['id']
  end

  # created_at — ISO 8601: парсится и лежит в секундах прогона.
  def assert_created_at_now(created_at)
    assert_in_delta Time.now.to_f, Time.parse(created_at).to_f, 10.0
  end

  # Дата окна на offset дней от сегодняшнего дня по Moscow (окно начинается сегодня).
  def moscow_date(offset)
    ((Time.now.getutc + MOSCOW_UTC_OFFSET) + (offset * 24 * 3600)).strftime('%Y-%m-%d')
  end
end
