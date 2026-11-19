# frozen_string_literal: true

require 'date'

# Общие правила окна записи и сетки стартов для use-case доступности (спецификация #19):
# рабочие часы 09:00–18:00 Europe/Moscow (фиксированный UTC+3, без перехода на летнее
# время — достаточно сдвига stdlib Time), старты шагом 30 минут, слот целиком помещается
# в часы, окно — 14 календарных дней, начиная с сегодняшнего. Единственный источник этих
# правил: оба эндпоинта доступности считаются по нему, расхождение невозможно.
module UseCases
  module SlotGrid
    MOSCOW_UTC_OFFSET = 3 * 3600
    WINDOW_DAYS = 14
    WORK_START_HOUR = 9
    WORK_END_HOUR = 18
    START_STEP_SECONDS = 30 * 60
    SLUG_PATTERN = /\A[a-z0-9-]{1,64}\z/

    module_function

    def valid_type_id?(value)
      value.is_a?(String) && SLUG_PATTERN.match?(value)
    end

    # Календарное «сегодня» по Moscow: UTC-момент сдвинут на фиксированный +03:00.
    def today_moscow(now_utc)
      (now_utc + MOSCOW_UTC_OFFSET).to_date
    end

    # Момент UTC, соответствующий указанному часу по Europe/Moscow в этот календарный день.
    def work_boundary(date, hour)
      Time.utc(date.year, date.month, date.day, hour) - MOSCOW_UTC_OFFSET
    end

    # Старты дня моментами UTC: шаг 30 минут от 09:00, слот длительности типа целиком
    # до 18:00 — старты, не влезающие в часы (17:30 для 60 минут), отсутствуют.
    def day_starts(date, duration_min)
      window_end = work_boundary(date, WORK_END_HOUR)

      starts = []
      start_time = work_boundary(date, WORK_START_HOUR)
      while (start_time + (duration_min * 60)) <= window_end
        starts << start_time
        start_time += START_STEP_SECONDS
      end
      starts
    end
  end
end
