// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "InventoryRules",
    products: [
        .library(name: "InventoryRules", targets: ["InventoryRules"])
    ],
    dependencies: [
        .package(url: "https://github.com/Quick/Quick.git", from: "7.0.0"),
        .package(url: "https://github.com/Quick/Nimble.git", from: "13.0.0")
    ],
    targets: [
        .target(name: "InventoryRules"),
        .testTarget(
            name: "InventoryRulesTests",
            dependencies: [
                "InventoryRules",
                .product(name: "Quick", package: "Quick"),
                .product(name: "Nimble", package: "Nimble")
            ]
        )
    ]
)
