import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)   // also makes `swift run` show a window and a Dock icon
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    /// Lets the page hand over its last changes and writes the save file before quitting.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        AppModel.shared.flushForQuit { sender.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }
}

@main
struct NBACareerSimApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel.shared

    var body: some Scene {
        WindowGroup("NBA Career Sim") {
            ContentView()
                .environmentObject(model)
        }
        .defaultSize(width: 1280, height: 820)
        .commands { GameCommands(model: model) }

        Settings {
            SettingsView()
                .environmentObject(model)
        }
    }
}

struct GameCommands: Commands {
    @ObservedObject var model: AppModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Career…") { model.confirmNewCareer = true }
                .keyboardShortcut("n")
        }

        CommandGroup(after: .newItem) {
            Button("Open Career…") { model.openCareer() }
                .keyboardShortcut("o")
            Button("Save Career As…") { model.saveCareerAs() }
                .keyboardShortcut("s", modifiers: [.command, .shift])
                .disabled(!model.info.hasCareer)
            Divider()
            Button("Share Player Card…") { model.sharePlayerCard() }
                .disabled(!model.info.hasCareer)
            Button("Show Save Files in Finder") { model.revealSaveFiles() }
        }

        CommandMenu("Game") {
            ForEach(GameSection.allCases) { item in
                Button(item.title) { model.select(item) }
                    .keyboardShortcut(item.key, modifiers: .command)
                    .disabled(!model.info.hasCareer)
            }
            Divider()
            Button("Sim Next Game") { model.simNextGame() }
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(!model.canSimNextGame)
            Button("Game Settings") { model.openGameSettings() }
                .keyboardShortcut("g", modifiers: [.command, .shift])
                .disabled(!model.info.hasCareer)
        }

        CommandGroup(after: .toolbar) {
            Button("Zoom In") { model.zoomIn() }
                .keyboardShortcut("=")
            Button("Zoom Out") { model.zoomOut() }
                .keyboardShortcut("-")
            Button("Actual Size") { model.zoomReset() }
                .keyboardShortcut("0")
            Divider()
            Button("Reload Game") { model.load() }
                .keyboardShortcut("r")
        }
    }
}
