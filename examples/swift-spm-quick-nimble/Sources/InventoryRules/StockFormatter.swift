public struct StockFormatter {
    public init() {}

    public func label(for available: Int, reserved: Int) -> String {
        let remaining = available - reserved

        if remaining <= 0 {
            return "out-of-stock"
        }

        return "\(remaining)-available"
    }
}
