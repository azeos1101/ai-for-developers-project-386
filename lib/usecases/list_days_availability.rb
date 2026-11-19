# frozen_string_literal: true

require 'date'
require_relative '../usecases'
require_relative 'slot_grid'

module UseCases
  # GET /api/availability/days: счётчики свободных стартов по всем календарным дням
  # 14-дневного окна записи (спецификация #19). Сетка стартов, часы и окно — общие
  # с ListDaySlots (SlotGrid); старты раньше текущего момента не считаются. Броней ещё
  # нет (тикеты бронирования впереди), поэтому счёт — только по времени и длительности
  # типа. Неверный формат meeting_type_id — :validation, неизвестный тип — :not_found
  # (матрица кодов контракта).
  class ListDaysAvailability
    VALIDATION_MESSAGE = 'Не удалось получить счётчики по дням. Проверьте meeting_type_id.'
    NOT_FOUND_MESSAGE = 'Тип встречи не найден.'

    def initialize(store:, now: Time.now)
      @store = store
      @now_utc = now.getutc
    end

    def call(meeting_type_id)
      return Failure.new(:validation, VALIDATION_MESSAGE) unless SlotGrid.valid_type_id?(meeting_type_id)

      type = @store.meeting_types.find { |candidate| candidate[:id] == meeting_type_id }
      return Failure.new(:not_found, NOT_FOUND_MESSAGE) if type.nil?

      days = (0...SlotGrid::WINDOW_DAYS).map do |offset|
        date = SlotGrid.today_moscow(@now_utc) + offset
        { date: date.strftime('%Y-%m-%d'), available_count: available_count(date, type[:duration]) }
      end

      Success.new({ meeting_type_id: meeting_type_id, days: days })
    end

    private

    # Число стартов дня: сетка из SlotGrid, старт не раньше текущего момента.
    def available_count(date, duration_min)
      SlotGrid.day_starts(date, duration_min).count { |start_time| start_time >= @now_utc }
    end
  end
end
