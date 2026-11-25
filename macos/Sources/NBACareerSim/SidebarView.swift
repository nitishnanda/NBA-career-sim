import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List(selection: selection) {
            if model.info.hasCareer {
                PlayerCard(info: model.info)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 10, leading: 8, bottom: 14, trailing: 8))
            }

            Section("Play") {
                ForEach(GameSection.allCases) { item in
                    Label(item.title, systemImage: item.symbol)
                        .badge(model.badge(for: item).map { Text($0) })
                        .tag(item)
                        .disabled(!model.info.hasCareer)
                }
            }

            Section("Game") {
                Button {
                    model.openGameSettings()
                } label: {
                    Label("Game Settings", systemImage: "gearshape")
                }
                .buttonStyle(.plain)
                .disabled(!model.info.hasCareer)

                Button {
                    model.confirmNewCareer = true
                } label: {
                    Label("New Career", systemImage: "plus.circle")
                }
                .buttonStyle(.plain)
            }
        }
        .listStyle(.sidebar)
    }

    private var selection: Binding<GameSection?> {
        Binding(
            get: { model.info.hasCareer ? model.section : nil },
            set: { if let picked = $0 { model.select(picked) } }
        )
    }
}

/// The header of the sidebar: the same facts the web header used to show.
private struct PlayerCard: View {
    let info: HostInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Text(initials)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(.quaternary))
                    .overlay(Circle().strokeBorder(.tertiary, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(info.name)
                        .font(.headline)
                        .lineLimit(1)
                    Text("\(info.pos) · Age \(info.age)" + (info.year > 0 ? " · Year \(info.year)" : ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(info.ovr)")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .monospacedDigit()
                Text("OVR")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(info.arch)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if let team = info.team {
                HStack {
                    Text(team)
                    Spacer()
                    if let record = info.record { Text(record).monospacedDigit() }
                }
                .font(.subheadline)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.quaternary.opacity(0.5)))
    }

    private var initials: String {
        let letters = info.name.split(separator: " ").compactMap { $0.first }.prefix(2)
        return String(letters).uppercased()
    }
}
