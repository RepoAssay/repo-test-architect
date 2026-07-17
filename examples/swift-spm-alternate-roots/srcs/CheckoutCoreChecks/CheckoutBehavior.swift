import XCTest

final class CheckoutBehavior: XCTestCase {
    func testInvalidCents() {
        XCTAssertThrowsError(try CheckoutParser().parseCents("invalid"))
    }
}
