# frozen_string_literal: true

require 'date'
require_relative '../usecases'
require_relative 'slot_grid'

module UseCases
  # GET /api/availability: все влезающие в рабочие часы старты конкретной даты для типа
  # встречи (спецификация #19, тикет #24). Сетка, часы и окно — общие с ListDaysAvailability
  # (SlotGrid); из прошедших стартов сегодняшнего дня недоступен каждый (броней ещё нет —
  # тикеты бронирования впереди). Неверный meeting_type_id или дата в прошлом, вне окна и
  # неверного формата — :validation, неизвестный тип — :not_found (матрица кодов контракта).
  class ListDaySlots
    VALIDATION_MESSAGE = 'Не удалось получить слоты дня. Проверьте date и meeting_type_id.'
    NOT_FOUND_MESSAGE = 'Тип встречи не найден.'

    def initialize(store:, now: Time.now)
      @store = store
      @now_utc = now.getutc
    end

    def call(date:, meeting_type_id:)
      return Failure.new(:validation, VALIDATION_MESSAGE) unless SlotGrid.valid_type_id?(meeting_type_id)

      type = @store.meeting_types.find { |candidate| candidate[:id] == meeting_type_id }
      return Failure.new(:not_found, NOT_FOUND_MESSAGE) if type.nil?

      day = window_date(date)
      return Failure.new(:validation, VALIDATION_MESSAGE) if day.nil?

      Success.new(payload(day, meeting_type_id, type[:duration]))
    end

    private

    # Ответ Availability: эхо параметров и полная сетка стартов дня.
    def payload(day, meeting_type_id, duration_min)
      starts = SlotGrid.day_starts(day, duration_min)

      {
        date: day.strftime('%Y-%m-%d'),
        meeting_type_id: meeting_type_id,
        slots: build_slots(starts, duration_min)
      }
    end

    # Рабочая дата запроса: та же проверка окна и формата, что и у POST /api/bookings
    # (SlotGrid::window_date); за пределами окна или кривой формат — nil → :validation.
    def window_date(date)
      SlotGrid.window_date(date, @now_utc)
    end

    # Один слот = старт + длительность типа в HH:MM по Moscow; доступен старт, не раньше
    # текущего момента (правило окна). Брони пометят занятыми будущие тикеты.
    def build_slots(starts, duration_min)
      starts.map do |start_time|
        {
          start: SlotGrid.moscow_hhmm(start_time),
          end: SlotGrid.moscow_hhmm(start_time + (duration_min * 60)),
          available: start_time >= @now_utc
        }
      end
    end
  end
end
