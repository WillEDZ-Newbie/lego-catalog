// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "LifeOSControlTower",
    products: [
        .library(name: "LifeOSControlTower", targets: ["LifeOSControlTower"])
    ],
    targets: [
        .target(name: "LifeOSControlTower"),
        .testTarget(
            name: "LifeOSControlTowerTests",
            dependencies: ["LifeOSControlTower"]
        )
    ]
)
