import Quick
import Nimble
@testable import InventoryRules

final class StockValidatorTests: QuickSpec {
    override class func spec() {
        describe("StockValidator") {
            it("allows reservations inside the backorder limit") {
                let validator = StockValidator()

                expect(validator.canReserve(requested: 8, available: 5, backorderLimit: 3)).to(beTrue())
            }
        }
    }
}
