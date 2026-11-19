# frozen_string_literal: true

require 'date'
require_relative '../usecases'
require_relative 'slot_grid'

module UseCases
  # GET /api/availability/days: счётчики свободных стартов по всем календарным дням
  # 14-дневного окна записи (спецификация #19, тикеты #23 и #25). Сетка стартов, часы и
  # окно — общие с ListDaySlots (SlotGrid); старты раньше текущего момента и старты,
  # пересекающиеся с существующими бронями, в счёт не входят. Неверный формат
  # meeting_type_id — :validation, неизвестный тип — :not_found (матрица кодов контракта).
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

    # Число стартов дня: сетка из SlotGrid; старты раньше текущего момента и старты,
    # пересекающиеся с бронями этого дня (тикет #25), не считаются.
    def available_count(date, duration_min)
      intervals = SlotGrid.day_booking_intervals(date, @store.bookings)

      SlotGrid.day_starts(date, duration_min).count do |start_time|
        start_time >= @now_utc &&
          !SlotGrid.overlaps_any?(start_time, start_time + (duration_min * 60), intervals)
      end
    end
  end
end
