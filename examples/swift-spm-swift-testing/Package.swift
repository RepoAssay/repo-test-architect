// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "PriceRules",
    products: [
        .library(name: "PriceRules", targets: ["PriceRules"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-testing", from: "0.12.0")
    ],
    targets: [
        .target(name: "PriceRules"),
        .testTarget(
            name: "PriceRulesTests",
            dependencies: [
                "PriceRules",
                .product(name: "Testing", package: "swift-testing")
            ]
        )
    ]
)
