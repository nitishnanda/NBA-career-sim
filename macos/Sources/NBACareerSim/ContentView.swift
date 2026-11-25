import SwiftUI

/// The window is the game page with a native toolbar: Season / Team / League / Career tabs in the middle,
/// Sim, settings and New on the right. (Settings can switch back to the game's own top bar.)
struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Color(red: 0.11, green: 0.11, blue: 0.118)   // same as the page, so there is no white flash while it loads
            GameWebView(webView: model.webView)
            if let problem = model.loadError {
                LoadProblem(text: problem) { model.load() }
            }
        }
        .navigationTitle(model.windowTitle)
        .navigationSubtitle(model.windowSubtitle)
        .toolbar {
            ToolbarItem(placement: .principal) {
                if model.toolbarTabs {
                    Picker("Screen", selection: tabSelection) {
                        ForEach(GameSection.allCases) { item in
                            Text(model.tabTitle(for: item)).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(minWidth: 360)
                    .disabled(!model.info.hasCareer)
                }
            }
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
                .help("Theme, AI key and saves (⇧⌘G)")
                .disabled(!model.info.hasCareer)

                Button {
                    model.confirmNewCareer = true
                } label: {
                    Label("New Career", systemImage: "plus")
                }
                .help("Start a new career (⌘N)")
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

extension ContentView {
    fileprivate var tabSelection: Binding<GameSection> {
        Binding(get: { model.section }, set: { model.select($0) })
    }
}

/// Shown only if the page could not be loaded.
private struct LoadProblem: View {
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
