# frozen_string_literal: true

require 'date'
require_relative '../usecases'
require_relative 'slot_grid'

module UseCases
  # GET /api/availability: все влезающие в рабочие часы старты конкретной даты для типа
  # встречи (спецификация #19, тикет #24). Сетка и часы — общие с ListDaysAvailability
  # (SlotGrid); времени броней ещё нет (тикеты бронирования впереди), поэтому старты
  # помечаются доступными. Неверный формат meeting_type_id — :validation, неизвестный
  # тип — :not_found (матрица кодов контракта).
  class ListDaySlots
    VALIDATION_MESSAGE = 'Не удалось получить слоты дня. Проверьте meeting_type_id.'
    NOT_FOUND_MESSAGE = 'Тип встречи не найден.'

    def initialize(store:, now: Time.now)
      @store = store
      @now_utc = now.getutc
    end

    def call(date:, meeting_type_id:)
      return Failure.new(:validation, VALIDATION_MESSAGE) unless SlotGrid.valid_type_id?(meeting_type_id)

      type = @store.meeting_types.find { |candidate| candidate[:id] == meeting_type_id }
      return Failure.new(:not_found, NOT_FOUND_MESSAGE) if type.nil?

      starts = SlotGrid.day_starts(Date.iso8601(date), type[:duration])
      Success.new({ date: date, meeting_type_id: meeting_type_id, slots: build_slots(starts, type[:duration]) })
    end

    private

    # Один слот = старт + длительность типа в HH:MM по Moscow; прошедшие старты и
    # будущие брони помечает недоступными следующие тикеты.
    def build_slots(starts, duration_min)
      starts.map do |start_time|
        {
          start: moscow_hhmm(start_time),
          end: moscow_hhmm(start_time + (duration_min * 60)),
          available: true
        }
      end
    end

    # HH:MM по Europe/Moscow: сдвиг на фиксированный +03:00, часы читаются из сдвинутого момента.
    def moscow_hhmm(utc_time)
      moscow_time = utc_time + SlotGrid::MOSCOW_UTC_OFFSET

      format('%<hour>02d:%<min>02d', hour: moscow_time.hour, min: moscow_time.min)
    end
  end
end
