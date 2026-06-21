// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CheckoutCore",
    products: [
        .library(name: "CheckoutCore", targets: ["CheckoutCore"])
    ],
    targets: [
        .target(name: "CheckoutCore"),
        .testTarget(name: "CheckoutCoreTests", dependencies: ["CheckoutCore"])
    ]
)
