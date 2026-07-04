public struct StockValidator {
    public init() {}

    public func canReserve(requested: Int, available: Int, backorderLimit: Int) -> Bool {
        guard requested > 0 else { return false }
        return requested <= available || requested <= available + backorderLimit
    }
}
