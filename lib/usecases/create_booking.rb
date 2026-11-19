# frozen_string_literal: true

require 'json'
require 'time'
require_relative '../usecases'
require_relative 'slot_grid'

module UseCases
  # POST /api/bookings: создание брони слота (спецификация #19, тикет #25). Проверки —
  # ровно матрица контракта: формат полей BookingInput (name ≥ 1, email ≥ 3, значения не
  # тримятся), неизвестный meeting_type_id, дата вне окна или кривого формата, старт не
  # на сетке 30 минут, не влезающий в рабочие часы или в прошлом — все :validation.
  # Правила окна и сетки — общие с доступностью (SlotGrid), расхождение невозможно.
  # Пересечение интервалов добавит следующий тикет: проверка и запись уже атомарны
  # (Store под мьютексом). Ответ — полная бронь: денормализованное meeting_type_name,
  # end = start + длительность, created_at ISO 8601.
  class CreateBooking
    VALIDATION_MESSAGE = 'Не удалось создать бронь. Проверьте поля и время.'

    def initialize(store:, now: Time.now)
      @store = store
      @now_utc = now.getutc
    end

    def call(body)
      input = parse_object(body)
      return Failure.new(:validation, VALIDATION_MESSAGE) unless valid_fields?(input)

      type = @store.meeting_types.find { |candidate| candidate[:id] == input['meeting_type_id'] }
      return Failure.new(:validation, VALIDATION_MESSAGE) if type.nil?

      day, start_time = slot_or_nil(input, type[:duration])
      return Failure.new(:validation, VALIDATION_MESSAGE) if start_time.nil?

      Success.new(book(type, day, start_time, input))
    end

    private

    def parse_object(body)
      parsed = JSON.parse(body)
      parsed.is_a?(Hash) ? parsed : nil
    rescue JSON::ParserError
      nil
    end

    # Формат полей BookingInput: обязательные строки правильной длины, meeting_type_id — слаг.
    def valid_fields?(input)
      return false if input.nil?

      SlotGrid.valid_type_id?(input['meeting_type_id']) &&
        string_of_length?(input['name'], 1) &&
        string_of_length?(input['email'], 3)
    end

    # Значения не тримятся (решение контракта): « » валидно, считаем только длину.
    def string_of_length?(value, min_length)
      value.is_a?(String) && value.length >= min_length
    end

    # Дата и старт запроса одним разбором: дата окна (SlotGrid::window_date) и старт на
    # сетке, влезающий в часы и не в прошлом; любая ошибка — [nil, nil] → :validation.
    def slot_or_nil(input, duration_min)
      day = SlotGrid.window_date(input['date'], @now_utc)
      return [nil, nil] if day.nil?

      start_time = grid_slot_start(day, input['start'], duration_min)
      [day, start_time]
    end

    # Старт запроса: момент на сетке 30 минут (SlotGrid::grid_start_time), слот длительности
    # типа целиком в рабочих часах и не раньше текущего момента; иначе nil → :validation.
    def grid_slot_start(day, start, duration_min)
      start_time = SlotGrid.grid_start_time(day, start)
      return nil if start_time.nil?
      return nil if start_time < SlotGrid.work_boundary(day, SlotGrid::WORK_START_HOUR)
      return nil if (start_time + (duration_min * 60)) > SlotGrid.work_boundary(day, SlotGrid::WORK_END_HOUR)
      return nil if start_time < @now_utc

      start_time
    end

    # Запись брони в Store под мьютексом (id целый, последовательный): тело Booking по
    # контракту с денормализованным meeting_type_name, end = старт + длительность по Moscow
    # и created_at — момент создания в ISO 8601.
    def book(type, day, start_time, input)
      end_time = start_time + (type[:duration] * 60)

      @store.add_booking(
        meeting_type_id: type[:id], meeting_type_name: type[:name], duration: type[:duration],
        name: input['name'], email: input['email'], date: day.strftime('%Y-%m-%d'),
        start: SlotGrid.moscow_hhmm(start_time), end: SlotGrid.moscow_hhmm(end_time),
        created_at: @now_utc.iso8601
      )
    end
  end
end
