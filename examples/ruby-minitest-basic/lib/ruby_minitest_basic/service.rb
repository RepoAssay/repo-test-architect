module RubyMinitestBasic
  class Service
    def enabled?(account)
      account.active? && !account.suspended?
    end
  end
end
