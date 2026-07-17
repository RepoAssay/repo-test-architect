public actor PaymentClient {
    public init() {}

    public func canCharge(cents: Int) async -> Bool {
        cents > 0
    }
}
