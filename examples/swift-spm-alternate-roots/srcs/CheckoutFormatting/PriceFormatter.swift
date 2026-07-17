public struct PriceFormatter {
    public func label(cents: Int) -> String {
        if cents == 0 { return "free" }
        return "\(cents) cents"
    }
}
