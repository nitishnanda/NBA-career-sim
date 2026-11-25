// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "NBACareerSim",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "NBACareerSim", path: "Sources/NBACareerSim")
    ]
)
