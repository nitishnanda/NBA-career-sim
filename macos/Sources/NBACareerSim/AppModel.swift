import AppKit
import SwiftUI
import WebKit

/// Owns the one WKWebView that runs the game and keeps the SwiftUI side in step with it.
/// The game reports its state through the `nbacs` message handler; menu items
/// and the toolbar send commands back through `window.__NBA_UI.host` (see src/ui.js).
final class AppModel: NSObject, ObservableObject {
    @Published var info = HostInfo.empty
    @Published var section: GameSection = .season
    @Published var confirmNewCareer = false
    @Published var loadError: String?
    @Published var zoom: Double {
        didSet {
            zoom = min(max(zoom, 0.7), 1.6)
            webView.pageZoom = zoom
            UserDefaults.standard.set(zoom, forKey: "pageZoom")
        }
    }

    /// Season / Team / League / Career as a segmented control in the window toolbar. Off: the game's own top bar shows instead.
    @Published var toolbarTabs: Bool {
        didSet { UserDefaults.standard.set(toolbarTabs, forKey: "toolbarTabs"); applyLook() }
    }
    /// The Mac look for the page (system font, flat surfaces, Mac-style controls). Off: the game's original look.
    @Published var macLook: Bool {
        didSet { UserDefaults.standard.set(macLook, forKey: "macLook"); applyLook() }
    }

    let webView: WKWebView
    private static let pageURL = URL(string: "nbacs://app/index.html")!

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "nbacs")
        webView = WKWebView(frame: .zero, configuration: config)
        let saved = UserDefaults.standard.double(forKey: "pageZoom")
        zoom = saved == 0 ? 1.0 : saved
        toolbarTabs = UserDefaults.standard.object(forKey: "toolbarTabs") as? Bool ?? true
        macLook = UserDefaults.standard.object(forKey: "macLook") as? Bool ?? true
        super.init()
        config.userContentController.add(self, name: "nbacs")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.pageZoom = zoom
        webView.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        load()
    }

    // MARK: derived state for the views

    var windowTitle: String { info.hasCareer ? info.name : "NBA Career Sim" }

    var windowSubtitle: String {
        guard info.hasCareer else { return "Create your player" }
        return [info.team, info.record].compactMap { $0 }.joined(separator: " · ")
    }

    var canSimNextGame: Bool { info.hasCareer && info.stage == "season_play" }

    func badge(for section: GameSection) -> String? { info.badge(for: section) }

    /// Tab label for the toolbar: "Career" or "Season · 2" when the game has news there.
    func tabTitle(for section: GameSection) -> String {
        guard let badge = info.badge(for: section) else { return section.shortTitle }
        return section.shortTitle + " · " + badge
    }

    // MARK: commands to the game

    func load() {
        loadError = PageResources.indexURL() == nil
            ? "The game page (index.html) was not found. Build the app with macos/build-app.sh."
            : nil
        webView.load(URLRequest(url: Self.pageURL))
    }

    func select(_ target: GameSection) {
        section = target
        run("window.__NBA_UI && window.__NBA_UI.host.setView('\(target.rawValue)')")
    }

    func startNewCareer() {
        run("window.__NBA_UI && window.__NBA_UI.host.newCareer()")
    }

    func openGameSettings() {
        run("window.__NBA_UI && window.__NBA_UI.host.settings()")
    }

    func simNextGame() {
        run("""
        (() => {
          const b = Array.from(document.querySelectorAll('button')).find((x) => /sim next game/i.test(x.textContent));
          if (b && !b.disabled) b.click();
        })()
        """)
    }

    func applyLook() {
        run("window.__NBA_UI && window.__NBA_UI.host.look(\(macLook), \(toolbarTabs))")
    }

    func zoomIn() { zoom += 0.1 }
    func zoomOut() { zoom -= 0.1 }
    func zoomReset() { zoom = 1.0 }

    /// Removes the save game and every setting (including a saved API key) and restarts the game.
    func resetGameData() {
        let store = webView.configuration.websiteDataStore
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        store.fetchDataRecords(ofTypes: types) { [weak self] records in
            store.removeData(ofTypes: types, for: records) {
                DispatchQueue.main.async {
                    self?.info = .empty
                    self?.section = .season
                    self?.load()
                }
            }
        }
    }

    private func run(_ js: String) {
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

// MARK: messages from the game

extension AppModel: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String,
              let data = text.data(using: .utf8),
              let next = try? JSONDecoder().decode(HostInfo.self, from: data) else { return }
        DispatchQueue.main.async {
            self.info = next
            if let shown = GameSection(rawValue: next.view), shown != self.section { self.section = shown }
        }
    }
}

// MARK: navigation, dialogs and downloads

extension AppModel: WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        guard let url = navigationAction.request.url, let scheme = url.scheme else {
            decisionHandler(.cancel)
            return
        }
        switch scheme {
        case "nbacs", "about", "blob", "data":
            decisionHandler(.allow)
        case "http", "https", "mailto":
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        default:
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        applyLook()
        webView.evaluateJavaScript("window.__NBA_UI && window.__NBA_UI.host.sync()", completionHandler: nil)
        DispatchQueue.main.async { webView.window?.makeFirstResponder(webView) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadError = error.localizedDescription
    }

    // links that want a new window (target=_blank) open in the browser
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    // saving the player card PNG and the career export JSON
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.canCreateDirectories = true
        panel.begin { result in
            guard result == .OK, let url = panel.url else {
                completionHandler(nil)
                return
            }
            try? FileManager.default.removeItem(at: url)   // WKDownload will not overwrite; the panel already asked
            completionHandler(url)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        let alert = NSAlert()
        alert.messageText = "Could not save the file"
        alert.informativeText = error.localizedDescription
        alert.runModal()
    }
}
