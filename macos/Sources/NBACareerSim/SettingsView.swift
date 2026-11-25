import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var confirmReset = false
    @State private var keyDraft = ""

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
                Toggle("Native pop-ups", isOn: $model.nativePopups)
                Text("Simple pop-ups (press, trades, injuries) open as Mac sheets. Pop-ups with fields or tables stay as they are.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("AI features") {
                SecureField("Claude API key (sk-ant-…)", text: $keyDraft)
                HStack {
                    Button("Save to Keychain") {
                        model.saveAIKey(keyDraft)
                        keyDraft = ""
                    }
                    .disabled(keyDraft.trimmingCharacters(in: .whitespaces).isEmpty)
                    Button("Remove Key", role: .destructive) { model.removeAIKey() }
                        .disabled(!model.hasAIKey)
                }
                Text(model.hasAIKey
                     ? "AI features are on. The key is in your Keychain and is only sent to api.anthropic.com."
                     : "AI features are off. Paste a key from console.anthropic.com to have Claude write the press room, timeline and career verdict.")
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
                Text("Your career is saved automatically in a file in Application Support, so it survives updates.")
                    .foregroundStyle(.secondary)
                Button("Show Save Files in Finder") { model.revealSaveFiles() }
                Button("Erase All Game Data…", role: .destructive) { confirmReset = true }
            }
        }
        .formStyle(.grouped)
        .frame(width: 480)
        .padding(.vertical, 8)
        .alert("Erase all game data?", isPresented: $confirmReset) {
            Button("Cancel", role: .cancel) {}
            Button("Erase", role: .destructive) { model.resetGameData() }
        } message: {
            Text("This deletes your career, all save slots, settings and a saved API key. It cannot be undone.")
        }
    }
}
