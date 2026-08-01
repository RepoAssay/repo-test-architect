defmodule Sample.ParserTest do
  use ExUnit.Case, async: true

  alias Sample.Parser

  test "normalizes surrounding whitespace" do
    assert Parser.normalize(" hello ") == "hello"
  end
end
