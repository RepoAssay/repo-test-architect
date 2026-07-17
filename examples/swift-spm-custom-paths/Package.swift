// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CustomCheckout",
    targets: [
        .target(
            name: "CheckoutCore",
            path: "Modules/CheckoutCore",
            exclude: ["Legacy"],
            sources: ["Parsing", "Networking"]
        ),
        .target(
            name: "CheckoutUI",
            path: "Modules/CheckoutUI"
        ),
        .testTarget(
            name: "CheckoutCoreVerification",
            dependencies: [.target(name: "CheckoutCore")],
            path: "Verification/Core",
            sources: ["Parser"]
        )
    ]
)
