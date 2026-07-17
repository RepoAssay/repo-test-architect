public struct CheckoutParser {
    public func display(_ value: String) -> String {
        if value.isEmpty { return "—" }
        return value
    }
}
