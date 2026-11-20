# frozen_string_literal: true

require_relative 'test_helper'

# POST /api/bookings — гонка параллельных запросов на один свободный слот (спецификация #19,
# README «Гонки», тикет #26): проверка пересечения и запись брони — одна атомарная операция
# в Store под мьютексом, поэтому N параллельных POST дают ровно одну 201, остальные — 409,
# и в хранилище остаётся одна бронь. Каждый поток работает своим Rack::MockRequest поверх
# VALIDATED_APP (общий Rack::Test::Session между потоками не потокобезопасен), ответы
# сверяются комитетом по openapi/openapi.yaml. Детерминизм: слот на последнем дне окна (+13)
# — весь день в будущем при любом часе прогона.
class BookingsConflictRaceTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600
  RACERS = 8

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
    create_consult_type
  end

  def test_parallel_posts_to_one_slot_produce_exactly_one_booking
    day = moscow_date(13)
    statuses = race_statuses(day)

    assert_equal [201] + ([409] * (RACERS - 1)), statuses.sort
    bookings = App.settings.store.bookings

    assert_equal 1, bookings.length
    assert_equal [day, '10:00', 'consult'], bookings[0].values_at(:date, :start, :meeting_type_id)
  end

  private

  def create_consult_type
    post_json '/api/meeting-types', { id: 'consult', name: 'Консультация', description: '', duration: 60 }

    assert_equal 201, last_response.status
  end

  # RACERS потоков стартуют по общему флагу (Queue) и делают POST на один слот каждый
  # своим MockRequest; возвращаются коды ответов всех попыток.
  def race_statuses(day)
    release = Queue.new

    threads = Array.new(RACERS) do
      Thread.new do
        release.pop
        post_booking_once(day).status
      end
    end

    RACERS.times { release << true }

    threads.map(&:value)
  end

  # Один POST /api/bookings от имени потока: свой Rack::MockRequest поверх VALIDATED_APP.
  def post_booking_once(day)
    Rack::MockRequest.new(VALIDATED_APP).post(
      '/api/bookings',
      input: JSON.generate(
        meeting_type_id: 'consult', name: 'Иван', email: 'ivan@example.com',
        date: day, start: '10:00'
      ),
      'CONTENT_TYPE' => 'application/json'
    )
  end

  # Дата окна на offset дней от сегодняшнего дня по Moscow (окно начинается сегодня).
  def moscow_date(offset)
    ((Time.now.getutc + MOSCOW_UTC_OFFSET) + (offset * 24 * 3600)).strftime('%Y-%m-%d')
  end
end
