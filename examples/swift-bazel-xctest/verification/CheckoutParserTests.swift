import XCTest
@testable import CheckoutCore

final class CheckoutParserTests: XCTestCase {
    func testParsesValidCents() throws {
        let parser = CheckoutParser()

        XCTAssertEqual(try parser.parseCents("42"), 42)
    }
}
