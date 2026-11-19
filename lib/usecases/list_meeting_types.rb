# frozen_string_literal: true

require_relative '../usecases'

module UseCases
  # GET /api/meeting-types: список типов встреч без ошибок (контракт фиксирует 200 MeetingType[]
  # в порядке заведения).
  class ListMeetingTypes
    def initialize(store:)
      @store = store
    end

    def call
      Success.new(@store.meeting_types)
    end
  end
end
