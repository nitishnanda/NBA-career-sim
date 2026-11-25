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
    var inbox: Int
    var badges: Badges

    static let empty = HostInfo(
        hasCareer: false, view: "season", stage: "create", name: "", pos: "", age: 0, ovr: 0,
        arch: "", year: 0, team: nil, record: nil, inbox: 0,
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

/// One piece of a pop-up the game described to the app (headings, text, buttons and cards of those).
/// `t` is "h" heading, "p" text, "b" button, "g" group.
struct DialogNode: Decodable, Equatable {
    var t: String
    var id: String?
    var text: String?
    var sub: String?
    var lv: Int?
    var dim: Bool?
    var cls: String?
    var off: Bool?
    var warn: Bool?
    var kids: [DialogNode]?
}
