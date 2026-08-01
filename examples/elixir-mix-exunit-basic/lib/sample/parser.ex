defmodule Sample.Parser do
  def normalize(value) when is_binary(value) do
    String.trim(value)
  end
end
