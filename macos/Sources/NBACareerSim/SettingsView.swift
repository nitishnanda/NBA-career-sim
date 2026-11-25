import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var confirmReset = false

    var body: some View {
        Form {
            Section("Appearance") {
                Toggle("Mac look", isOn: $model.macLook)
                Text("System font, flat surfaces and Mac-style buttons. Off shows the game's original look.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Toggle("Tabs in the window toolbar", isOn: $model.toolbarTabs)
                Text("Off shows the game's own top bar instead.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Display") {
                HStack {
                    Slider(value: $model.zoom, in: 0.7...1.6, step: 0.1) {
                        Text("Page zoom")
                    }
                    Text("\(Int((model.zoom * 100).rounded()))%")
                        .monospacedDigit()
                        .frame(width: 48, alignment: .trailing)
                }
                Button("Actual Size") { model.zoomReset() }
            }

            Section("Game") {
                Text("The theme, team colours, AI key and save slots live in the game's own settings.")
                    .foregroundStyle(.secondary)
                Button("Open Game Settings") { model.openGameSettings() }
                    .disabled(!model.info.hasCareer)
            }

            Section("Data") {
                Text("Your career is stored on this Mac, inside the app's web storage.")
                    .foregroundStyle(.secondary)
                Button("Erase All Game Data…", role: .destructive) { confirmReset = true }
            }
        }
        .formStyle(.grouped)
        .frame(width: 440)
        .padding(.vertical, 8)
        .alert("Erase all game data?", isPresented: $confirmReset) {
            Button("Cancel", role: .cancel) {}
            Button("Erase", role: .destructive) { model.resetGameData() }
        } message: {
            Text("This deletes your career, all save slots, settings and a saved API key. It cannot be undone.")
        }
    }
}
