public struct DiscountValidator {
    public init() {}

    public func isValid(percent: Int) -> Bool {
        percent >= 0 && percent <= 100
    }
}
