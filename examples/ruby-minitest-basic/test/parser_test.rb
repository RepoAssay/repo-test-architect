require "minitest/autorun"
require "ruby_minitest_basic/parser"

class ParserTest < Minitest::Test
  def test_strips_input
    assert_equal "hello", RubyMinitestBasic::Parser.parse(" hello ")
  end

  def test_rejects_nil
    assert_raises(ArgumentError) { RubyMinitestBasic::Parser.parse(nil) }
  end
end
