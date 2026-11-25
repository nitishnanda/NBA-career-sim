import SwiftUI

/// The window is just the game: its own top bar (Season, Team, Around the League, Career) is the navigation.
struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            GameWebView(webView: model.webView)
            if let problem = model.loadError {
                LoadProblem(text: problem) { model.load() }
            }
        }
        .navigationTitle(model.windowTitle)
        .navigationSubtitle(model.windowSubtitle)
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
