# frozen_string_literal: true

require_relative '../usecases'

module UseCases
  # GET /api/bookings: список предстоящих броней всех типов (спецификация #19, user stories
  # 31–33, тикет #27), отсортированный по дате и началу по возрастанию — строки YYYY-MM-DD
  # и HH:MM сортируются лексикографически так же, как хронологически. Отказов нет: контракт
  # отвечает всегда 200 Booking[], поэтому Success всегда, общий формат результатов сохранён.
  class ListBookings
    def initialize(store:)
      @store = store
    end

    def call
      Success.new(sorted_bookings)
    end

    private

    def sorted_bookings
      @store.bookings.sort_by { |booking| [booking[:date], booking[:start]] }
    end
  end
end
