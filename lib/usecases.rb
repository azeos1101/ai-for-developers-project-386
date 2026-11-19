# frozen_string_literal: true

# Результат исполнения use-case одной формы (спецификация #19): Success(значение)
# или Failure(код, сообщение). Приложение маппит коды отказов в HTTP по матрице контракта:
# :validation → 422, :conflict → 409, :not_found → 404.
module UseCases
  Success = Struct.new(:value)
  Failure = Struct.new(:code, :message)
end
