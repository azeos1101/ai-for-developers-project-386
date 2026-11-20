# frozen_string_literal: true

require 'date'
require_relative 'usecases/slot_grid'

# Хранилище в памяти процесса: типы встреч и брони живут до перезапуска (ограничение названо в README).
# Списки хранятся в порядке заведения, мьютекс делает проверку занятости id, проверку пересечений
# и добавление атомарными.
class Store
  def initialize
    @mutex = Mutex.new
    @meeting_types = []
    @bookings = []
    @next_booking_id = 1
  end

  # Копия списка типов встреч в порядке заведения.
  def meeting_types
    @mutex.synchronize { @meeting_types.dup }
  end

  # Копия списка броней в порядке заведения (id целые, последовательные).
  def bookings
    @mutex.synchronize { @bookings.dup }
  end

  # Добавляет тип встречи, если id свободен; возвращает false, когда id занят.
  def add_meeting_type(type)
    @mutex.synchronize do
      return false if @meeting_types.any? { |existing| existing[:id] == type[:id] }

      @meeting_types << type
    end
  end

  # Одна атомарная операция под мьютексом: находит пересечения среди существующих броней
  # календарной даты (slot_conflicts?) и только без пересечения заносит бронь под следующий
  # целый id. Поэтому гонка параллельных POST даёт ровно одну бронь (README). Возвращает
  # сохранённую бронь или :conflict, ничего не записав.
  def add_booking_if_free(booking)
    @mutex.synchronize do
      return :conflict if slot_conflicts?(booking)

      stored = booking.merge(id: @next_booking_id)
      @next_booking_id += 1
      @bookings << stored
      stored
    end
  end

  # Очищает хранилище — фикстура rack-тестов, чтобы каждый тест начинал с пустого хранилища.
  def reset!
    @mutex.synchronize do
      @meeting_types.clear
      @bookings.clear
      @next_booking_id = 1
    end
  end

  private

  # Пересекается ли интервал брони [start, end) календарной даты с какой-либо из сохранённых
  # броней (даты HH:MM — тот же день). Правила интервалов — SlotGrid, тот же источник, что
  # и у доступности: пересечение с любой бронью любого типа, примыкание end == start
  # разрешено. Вызывать только под @mutex: читает @bookings без блокировки.
  def slot_conflicts?(booking)
    day = Date.iso8601(booking[:date])
    slot_start = UseCases::SlotGrid.grid_start_time(day, booking[:start])
    slot_end = UseCases::SlotGrid.grid_start_time(day, booking[:end])
    intervals = UseCases::SlotGrid.day_booking_intervals(day, @bookings)

    UseCases::SlotGrid.overlaps_any?(slot_start, slot_end, intervals)
  end
end
