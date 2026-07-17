// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AlternateCheckout",
    targets: [
        .target(name: "CheckoutCore"),
        .target(name: "CheckoutSupport"),
        .target(name: "CheckoutFormatting"),
        .testTarget(name: "CheckoutCoreChecks", dependencies: ["CheckoutCore"])
    ]
)
