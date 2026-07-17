public struct CheckoutParser {
    public init() {}

    public func parseCents(_ value: String) throws -> Int {
        guard let cents = Int(value), cents >= 0 else {
            throw CheckoutParserError.invalidCents
        }

        return cents
    }
}

public enum CheckoutParserError: Error {
    case invalidCents
}
