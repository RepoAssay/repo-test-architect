module RubyMinitestBasic
  class Parser
    def self.parse(value)
      raise ArgumentError, "value is required" if value.nil?

      value.strip
    end
  end
end
