# frozen_string_literal: true

require_relative 'test_helper'

# GET /api/availability — сетка стартов дня (спецификация #19, user story 7, тикет #24):
# только старты шагом 30 минут, чей слот целиком помещается в рабочие часы 09:00–18:00
# Europe/Moscow. Ожидаемые списки — фикстура из правил, а не из реализации: тип 60 минут
# ⇒ старты 09:00…17:00 (17 штук, 17:30 в ответе нет), тип 30 минут ⇒ 09:00…17:30 (18).
# Дата берётся на 2 дня вперёд от сегодня (Moscow) — полный будущий день окна не зависит
# от часов прогона. Формат ответа сверяет комитет по openapi/openapi.yaml.
class AvailabilitySlotsGridTest < Minitest::Test
  include Rack::Test::Methods

  MOSCOW_UTC_OFFSET = 3 * 3600

  # Фикстура правил: 60-минутный слот стартует с 09:00 по 17:00 с шагом 30 минут,
  # старт 17:30 не влезает в 18:00 и в ответе отсутствует вовсе.
  DAY60_STARTS = %w[
    09:00 09:30 10:00 10:30 11:00 11:30 12:00 12:30 13:00 13:30
    14:00 14:30 15:00 15:30 16:00 16:30 17:00
  ].freeze
  DAY60_ENDS = %w[
    10:00 10:30 11:00 11:30 12:00 12:30 13:00 13:30 14:00 14:30
    15:00 15:30 16:00 16:30 17:00 17:30 18:00
  ].freeze

  # Фикстура правил: 30-минутный слот влезает и в 17:30 — полный день 18 стартов.
  DAY30_STARTS = %w[
    09:00 09:30 10:00 10:30 11:00 11:30 12:00 12:30 13:00 13:30
    14:00 14:30 15:00 15:30 16:00 16:30 17:00 17:30
  ].freeze
  DAY30_ENDS = %w[
    09:30 10:00 10:30 11:00 11:30 12:00 12:30 13:00 13:30 14:00
    14:30 15:00 15:30 16:00 16:30 17:00 17:30 18:00
  ].freeze

  def app = VALIDATED_APP

  def setup
    App.settings.store.reset!
  end

  def test_sixty_minute_type_returns_seventeen_starts_without_half_past_five
    create_type(id: 'consult', duration: 60)

    body = request_slots('consult', moscow_date(2))

    assert_equal(DAY60_STARTS, body['slots'].map { |slot| slot['start'] })
    assert_equal(DAY60_ENDS, body['slots'].map { |slot| slot['end'] })
  end

  def test_thirty_minute_type_returns_eighteen_starts_through_half_past_five
    create_type(id: 'intro-call', duration: 30)

    body = request_slots('intro-call', moscow_date(2))

    assert_equal(DAY30_STARTS, body['slots'].map { |slot| slot['start'] })
    assert_equal(DAY30_ENDS, body['slots'].map { |slot| slot['end'] })
  end

  private

  def create_type(id:, duration:)
    post_json '/api/meeting-types', { id: id, name: 'Созвон', description: '', duration: duration }

    assert_equal 201, last_response.status
  end

  # Успешный GET /api/availability: комитет сверяет структуру Availability, тест проверяет
  # эхо параметров и возвращает тело для ассертов по сетке.
  def request_slots(type_id, date)
    get '/api/availability', { date: date, meeting_type_id: type_id }

    assert_equal 200, last_response.status

    body = JSON.parse(last_response.body)

    assert_equal date, body['date']
    assert_equal type_id, body['meeting_type_id']
    body
  end

  # Дата окна на offset дней от сегодняшнего дня по Moscow (окно начинается сегодня).
  def moscow_date(offset)
    ((Time.now.getutc + MOSCOW_UTC_OFFSET) + (offset * 24 * 3600)).strftime('%Y-%m-%d')
  end
end
