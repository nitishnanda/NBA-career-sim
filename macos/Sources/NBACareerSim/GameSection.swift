import SwiftUI

/// The four screens of the game. Raw values match the `view` names inside the web UI (src/ui.js).
enum GameSection: String, CaseIterable, Identifiable {
    case season, team, league, career

    var id: String { rawValue }

    var title: String {
        switch self {
        case .season: return "Season"
        case .team: return "Team"
        case .league: return "Around the League"
        case .career: return "Career"
        }
    }

    var shortTitle: String {
        switch self {
        case .season: return "Season"
        case .team: return "Team"
        case .league: return "League"
        case .career: return "Career"
        }
    }

    var symbol: String {
        switch self {
        case .season: return "calendar"
        case .team: return "person.3.fill"
        case .league: return "globe.americas.fill"
        case .career: return "trophy.fill"
        }
    }

    var key: KeyEquivalent {
        switch self {
        case .season: return "1"
        case .team: return "2"
        case .league: return "3"
        case .career: return "4"
        }
    }
}
