# frozen_string_literal: true

require 'time'

require_relative 'test_helper'

# GET /api/bookings — список предстоящих броней владельца (спецификация #19, user stories
# 31–33, тикет #27): 200 Booking[] без ошибок. Ожидания берутся из требований: только брони
# со стартом строго позже текущего момента (Europe/Moscow), сортировка по дате и началу
# по возрастанию, пустой массив на пустом хранилище. Формат ответа сверяет комитет по
# openapi/openapi.yaml. Даты — на +2 дня от сегодня по Moscow: весь день в будущем,
# прогон не зависит от часов. Границу «сейчас» проверяет Time.stub(:now) вокруг GET —
# эквивалент injectable now в use-case (образец: availability_slots_test.rb).
class BookingsListTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
  end

  def test_empty_store_returns_empty_array
    get '/api/bookings'

    assert_equal 200, last_response.status

    assert_equal [], JSON.parse(last_response.body)
  end

  # Порядок из user story 31: список отсортирован по дате и началу по возрастанию, а не
  # в порядке заведения. Фикстура заводит бронь 12:00 раньше, чем 09:30 того же дня, —
  # ответ обязан быть [09:30, 12:00]. Ожидаемые пары заданы буквально по требованию.
  def test_bookings_sorted_by_date_and_start_ascending_regardless_of_creation_order
    create_consult_type
    day = moscow_date(2)

    book(date: day, start: '12:00')
    book(date: day, start: '09:30')

    get '/api/bookings'

    assert_equal 200, last_response.status

    body = JSON.parse(last_response.body)

    assert_equal([[day, '09:30'], [day, '12:00']], body.map { |booking| [booking['date'], booking['start']] })
  end

  private

  def create_consult_type
    post_json '/api/meeting-types', { id: 'consult', name: 'Консультация', description: '', duration: 60 }

    assert_equal 201, last_response.status
  end

  # Успешная бронь слота date HH:MM (комитет сверяет тело Booking).
  def book(date:, start:)
    post_json '/api/bookings',
              { meeting_type_id: 'consult', name: 'Иван', email: 'ivan@example.com', date: date, start: start }

    assert_equal 201, last_response.status
  end

  # Дата окна на offset дней от сегодняшнего дня по Moscow (окно начинается сегодня).
  def moscow_date(offset)
    ((Time.now.getutc + MOSCOW_UTC_OFFSET) + (offset * 24 * 3600)).strftime('%Y-%m-%d')
  end
end
