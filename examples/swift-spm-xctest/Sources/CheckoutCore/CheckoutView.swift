import SwiftUI

public struct CheckoutView: View {
    public let totalCents: Int

    public var body: some View {
        Text("Total: \(totalCents)")
    }
}
