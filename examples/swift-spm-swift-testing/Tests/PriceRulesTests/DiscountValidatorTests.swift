import Testing
@testable import PriceRules

@Test func validatesDiscountBounds() {
    let validator = DiscountValidator()

    #expect(validator.isValid(percent: 25))
}
