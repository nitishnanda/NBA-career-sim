import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 210, ideal: 240, max: 300)
        } detail: {
            ZStack {
                GameWebView(webView: model.webView)
                if let problem = model.loadError {
                    ContentUnavailableMessage(text: problem) { model.load() }
                }
            }
        }
        .navigationTitle(model.windowTitle)
        .navigationSubtitle(model.windowSubtitle)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    model.simNextGame()
                } label: {
                    Label("Sim Next Game", systemImage: "play.fill")
                }
                .help("Sim the next game (⌘↩)")
                .disabled(!model.canSimNextGame)

                Button {
                    model.openGameSettings()
                } label: {
                    Label("Game Settings", systemImage: "gearshape")
                }
                .help("Theme, AI key and saves")
                .disabled(!model.info.hasCareer)
            }
        }
        .alert("Start a new career?", isPresented: $model.confirmNewCareer) {
            Button("Cancel", role: .cancel) {}
            Button("New Career", role: .destructive) { model.startNewCareer() }
        } message: {
            Text("This erases the career you are playing now.")
        }
        .frame(minWidth: 980, minHeight: 640)
        .preferredColorScheme(.dark)
    }
}

/// Shown only if the page could not be loaded.
private struct ContentUnavailableMessage: View {
    let text: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
            Text(text)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
            Button("Try Again", action: retry)
        }
        .padding(30)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
