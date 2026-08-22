// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "TowerCore",
    products: [
        .library(name: "TowerCore", targets: ["TowerCore"])
    ],
    targets: [
        .target(name: "TowerCore"),
        .executableTarget(name: "TowerWeb", dependencies: ["TowerCore"]),
        .testTarget(name: "TowerCoreTests", dependencies: ["TowerCore"])
    ]
)
