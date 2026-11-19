# frozen_string_literal: true

require 'date'
require_relative '../usecases'

module UseCases
  # GET /api/availability/days: счётчики свободных стартов по всем календарным дням
  # 14-дневного окна записи (спецификация #19). Старты шагом 30 минут от 09:00, целиком
  # влезающие в рабочие часы 09:00–18:00 Europe/Moscow (фиксированный UTC+3, без перехода
  # на летнее время — достаточно сдвига stdlib Time); старты раньше текущего момента
  # не считаются. Броней ещё нет (тикеты бронирования впереди), поэтому счёт — только по
  # времени и длительности типа. Неверный формат meeting_type_id — :validation,
  # неизвестный тип — :not_found (матрица кодов контракта).
  class ListDaysAvailability
    MOSCOW_UTC_OFFSET = 3 * 3600
    WINDOW_DAYS = 14
    WORK_START_HOUR = 9
    WORK_END_HOUR = 18
    START_STEP_SECONDS = 30 * 60
    SLUG_PATTERN = /\A[a-z0-9-]{1,64}\z/

    VALIDATION_MESSAGE = 'Не удалось получить счётчики по дням. Проверьте meeting_type_id.'
    NOT_FOUND_MESSAGE = 'Тип встречи не найден.'

    def initialize(store:, now: Time.now)
      @store = store
      @now_utc = now.getutc
    end

    def call(meeting_type_id)
      return Failure.new(:validation, VALIDATION_MESSAGE) unless valid_slug?(meeting_type_id)

      type = @store.meeting_types.find { |candidate| candidate[:id] == meeting_type_id }
      return Failure.new(:not_found, NOT_FOUND_MESSAGE) if type.nil?

      days = (0...WINDOW_DAYS).map do |offset|
        date = today_moscow + offset
        { date: date.strftime('%Y-%m-%d'), available_count: available_count(date, type[:duration]) }
      end

      Success.new({ meeting_type_id: meeting_type_id, days: days })
    end

    private

    def valid_slug?(meeting_type_id)
      meeting_type_id.is_a?(String) && SLUG_PATTERN.match?(meeting_type_id)
    end

    # Календарное «сегодня» по Moscow: UTC-момент сдвинут на фиксированный +03:00.
    def today_moscow
      (@now_utc + MOSCOW_UTC_OFFSET).to_date
    end

    # Число стартов дня: сетка 30 минут от 09:00, слот длительности типа целиком
    # до 18:00, старт не раньше текущего момента.
    def available_count(date, duration_min)
      window_start = work_boundary(date, WORK_START_HOUR)
      window_end = work_boundary(date, WORK_END_HOUR)

      count = 0
      start_time = window_start
      while (start_time + (duration_min * 60)) <= window_end
        count += 1 if start_time >= @now_utc
        start_time += START_STEP_SECONDS
      end
      count
    end

    # Момент UTC, соответствующий указанному часу по Europe/Moscow в этот календарный день.
    def work_boundary(date, hour)
      Time.utc(date.year, date.month, date.day, hour) - MOSCOW_UTC_OFFSET
    end
  end
end
