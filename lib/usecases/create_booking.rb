# frozen_string_literal: true

require 'json'
require 'time'
require_relative '../usecases'
require_relative 'slot_grid'

module UseCases
  # POST /api/bookings: создание брони слота (спецификация #19, тикеты #25 и #26). Проверки —
  # ровно матрица контракта: формат полей BookingInput (name ≥ 1, email ≥ 3, значения не
  # тримятся), неизвестный meeting_type_id, дата вне окна или кривого формата, старт не
  # на сетке 30 минут, не влезающий в рабочие часы или в прошлом — все :validation.
  # Правила окна и сетки — общие с доступностью (SlotGrid), расхождение невозможно.
  # Пересечение интервалов — :conflict (409): проверка и запись одной атомарной операцией
  # в Store под мьютексом, поэтому гонка параллельных запросов даёт ровно одну бронь.
  # Ответ — полная бронь: денормализованное meeting_type_name, end = start + длительность,
  # created_at ISO 8601.
  class CreateBooking
    VALIDATION_MESSAGE = 'Не удалось создать бронь. Проверьте поля и время.'
    CONFLICT_MESSAGE = 'Это время уже занято. Выберите другое время.'

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

      book_or_conflict(type, day, start_time, input)
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

    # Атомарная проверка пересечения и запись в Store: без пересечения — Success с бронью,
    # пересечение — :conflict (409 по матрице контракта), хранилище не тронуто.
    def book_or_conflict(type, day, start_time, input)
      booking = book(type, day, start_time, input)
      return Failure.new(:conflict, CONFLICT_MESSAGE) if booking == :conflict

      Success.new(booking)
    end

    # Запись брони в Store одной атомарной операцией с проверкой пересечения (id целый,
    # последовательный): тело Booking по контракту с денормализованным meeting_type_name,
    # end = старт + длительность по Moscow и created_at — момент создания в ISO 8601.
    # Пересечение — :conflict от Store, ничего не записано.
    def book(type, day, start_time, input)
      end_time = start_time + (type[:duration] * 60)

      @store.add_booking_if_free(
        meeting_type_id: type[:id], meeting_type_name: type[:name], duration: type[:duration],
        name: input['name'], email: input['email'], date: day.strftime('%Y-%m-%d'),
        start: SlotGrid.moscow_hhmm(start_time), end: SlotGrid.moscow_hhmm(end_time),
        created_at: @now_utc.iso8601
      )
    end
  end
end
