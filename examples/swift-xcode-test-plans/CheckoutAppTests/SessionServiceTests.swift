import XCTest
@testable import CheckoutApp

final class SessionServiceTests: XCTestCase {
    func testRestoresNonemptyToken() {
        XCTAssertTrue(SessionService().canRestore(token: "token"))
    }
}
