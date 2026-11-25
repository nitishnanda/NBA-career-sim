import Foundation

/// What the game tells the app after every screen it draws (see `hostSync` in src/ui.js).
struct HostInfo: Decodable, Equatable {
    struct Badges: Decodable, Equatable {
        var season: String?
        var team: String?
        var league: String?
        var career: String?
    }

    var hasCareer: Bool
    var view: String
    var stage: String
    var name: String
    var pos: String
    var age: Int
    var ovr: Int
    var arch: String
    var year: Int
    var team: String?
    var record: String?
    var badges: Badges

    static let empty = HostInfo(
        hasCareer: false, view: "season", stage: "create", name: "", pos: "", age: 0, ovr: 0,
        arch: "", year: 0, team: nil, record: nil,
        badges: Badges(season: nil, team: nil, league: nil, career: nil)
    )

    func badge(for section: GameSection) -> String? {
        switch section {
        case .season: return badges.season
        case .team: return badges.team
        case .league: return badges.league
        case .career: return badges.career
        }
    }
}
