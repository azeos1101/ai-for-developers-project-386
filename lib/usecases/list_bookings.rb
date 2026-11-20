# frozen_string_literal: true

require_relative '../usecases'

module UseCases
  # GET /api/bookings: список предстоящих броней всех типов (спецификация #19, user stories
  # 31–33, тикет #27). Отказов нет — контракт отвечает всегда 200 Booking[], поэтому
  # Success returned всегда; общий формат Success/Failure сохранен как у остальных use-case.
  class ListBookings
    def initialize(store:)
      @store = store
    end

    def call
      Success.new(@store.bookings)
    end
  end
end
