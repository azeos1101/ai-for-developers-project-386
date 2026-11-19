# frozen_string_literal: true

require 'json'
require_relative '../usecases'

module UseCases
  # POST /api/meeting-types: проверка полей MeetingTypeInput по контракту и занятие свободного id.
  # Тело отказа плоское {code, message} без имени поля (спецификация #19).
  class CreateMeetingType
    SLUG_PATTERN = /\A[a-z0-9-]{1,64}\z/
    MIN_DURATION = 30
    MAX_DURATION = 240
    DURATION_STEP = 30

    VALIDATION_MESSAGE = 'Не удалось создать тип встречи. Проверьте поля.'
    CONFLICT_MESSAGE = 'Тип с таким id уже существует.'

    def initialize(store:)
      @store = store
    end

    def call(body)
      input = parse_object(body)
      return Failure.new(:validation, VALIDATION_MESSAGE) unless valid?(input)

      type = {
        id: input['id'],
        name: input['name'],
        description: input.fetch('description', ''),
        duration: input['duration']
      }
      return Failure.new(:conflict, CONFLICT_MESSAGE) unless @store.add_meeting_type(type)

      Success.new(type)
    end

    private

    def parse_object(body)
      parsed = JSON.parse(body)
      parsed.is_a?(Hash) ? parsed : nil
    rescue JSON::ParserError
      nil
    end

    def valid?(input)
      return false if input.nil?

      slug?(input['id']) && name?(input['name']) && description?(input) && duration?(input['duration'])
    end

    def slug?(id)
      id.is_a?(String) && SLUG_PATTERN.match?(id)
    end

    def name?(name)
      name.is_a?(String) && !name.empty?
    end

    def description?(input)
      !input.key?('description') || input['description'].is_a?(String)
    end

    def duration?(duration)
      duration.is_a?(Integer) &&
        duration >= MIN_DURATION && duration <= MAX_DURATION &&
        (duration % DURATION_STEP).zero?
    end
  end
end
