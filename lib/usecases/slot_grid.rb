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
    START_STEP_MINUTES = 30
    SLUG_PATTERN = /\A[a-z0-9-]{1,64}\z/

    module_function

    def valid_type_id?(value)
      value.is_a?(String) && SLUG_PATTERN.match?(value)
    end

    # Календарное «сегодня» по Moscow: UTC-момент сдвинут на фиксированный +03:00.
    def today_moscow(now_utc)
      (now_utc + MOSCOW_UTC_OFFSET).to_date
    end

    # Рабочая дата запроса: YYYY-MM-DD, существовавший календарный день внутри окна записи
    # (окно начинается сегодня по Moscow, 14 дней); иначе nil → :validation. Date::Error —
    # штатный сигнал парсера «такого дня нет» (2026-02-30), здесь он и есть отказ.
    def window_date(date, now_utc)
      parsed = begin
        date.is_a?(String) ? Date.iso8601(date) : nil
      rescue Date::Error
        nil
      end
      return nil if parsed.nil?

      today = today_moscow(now_utc)
      parsed if parsed >= today && (parsed - today) < WINDOW_DAYS
    end

    # HH:MM по Europe/Moscow: сдвиг на фиксированный +03:00, часы читаются из сдвинутого момента.
    def moscow_hhmm(utc_time)
      moscow_time = utc_time + MOSCOW_UTC_OFFSET

      format('%<hour>02d:%<min>02d', hour: moscow_time.hour, min: moscow_time.min)
    end

    # Начало HH:MM этого дня моментом UTC по той же сетке 30 минут, что и day_starts:
    # корректное HH:MM (часы 00–23, минуты 00 или 30) → момент; кривая строка или старт
    # вне сетки (10:15, 09:90) → nil.
    def grid_start_time(date, hhmm)
      return nil unless hhmm.is_a?(String)

      matched = /\A(\d{2}):(\d{2})\z/.match(hhmm)
      return nil if matched.nil?

      hour = matched[1].to_i
      minute = matched[2].to_i
      return nil if hour > 23 || minute % START_STEP_MINUTES != 0

      work_boundary(date, hour) + (minute * 60)
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

    # Занятые интервалы дня парами моментов UTC [начало, конец): брони календарной даты,
    # их start/end — HH:MM того же дня по Moscow. Общий источник для обоих эндпоинтов
    # доступности (тикет #25): старт слота вне занятости, если не пересекается ни с одним
    # интервалом (примыкание end == start следующего слота пересечением не считается).
    def day_booking_intervals(date, bookings)
      day = date.strftime('%Y-%m-%d')

      bookings.filter_map do |booking|
        next unless booking[:date] == day

        start_time = grid_start_time(date, booking[:start])
        end_time = grid_start_time(date, booking[:end])
        next if start_time.nil? || end_time.nil?

        [start_time, end_time]
      end
    end

    # Пересекается ли слот [start_time, slot_end) с каким-либо занятым интервалом.
    def overlaps_any?(start_time, slot_end, intervals)
      intervals.any? { |booking_start, booking_end| start_time < booking_end && booking_start < slot_end }
    end
  end
end
