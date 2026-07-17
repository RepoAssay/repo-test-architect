import XCTest

final class CheckoutBehaviorTests: XCTestCase {
    func testInvalidCents() {
        XCTAssertThrowsError(try CheckoutParser().parseCents("invalid"))
    }
}
