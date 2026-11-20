# frozen_string_literal: true

require 'date'
require_relative '../usecases'
require_relative 'slot_grid'

module UseCases
  # GET /api/bookings: список предстоящих броней всех типов (спецификация #19, user stories
  # 31–33, тикет #27). В список входят только брони со стартом строго позже текущего момента
  # (Europe/Moscow — старт date + start считается моментом через SlotGrid, тот же источник
  # времени, что у доступности), отсортированы по дате и началу по возрастанию — строки
  # YYYY-MM-DD и HH:MM сортируются лексикографически так же, как хронологически. Отказов нет:
  # контракт отвечает всегда 200 Booking[], поэтому Success всегда, общий формат результатов сохранён.
  class ListBookings
    def initialize(store:, now: Time.now)
      @store = store
      @now_utc = now.getutc
    end

    def call
      Success.new(upcoming_sorted)
    end

    private

    def upcoming_sorted
      @store.bookings
            .select { |booking| start_time(booking) > @now_utc }
            .sort_by { |booking| [booking[:date], booking[:start]] }
    end

    # Момент UTC начала брони: HH:MM календарной даты по Europe/Moscow (обратный сдвиг на
    # фиксированный +03:00 делает SlotGrid.grid_start_time).
    def start_time(booking)
      SlotGrid.grid_start_time(Date.iso8601(booking[:date]), booking[:start])
    end
  end
end
