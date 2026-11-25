import AppKit
import SwiftUI
import UniformTypeIdentifiers
import WebKit

/// Owns the one WKWebView that runs the game and keeps the SwiftUI side in step with it.
/// The game reports its state through the `nbacs` message handler; menu items, the toolbar and the
/// pop-up sheets send commands back through `window.__NBA_UI.host` (see src/ui.js).
final class AppModel: NSObject, ObservableObject {
    static let shared = AppModel()

    @Published var info = HostInfo.empty
    @Published var section: GameSection = .season
    @Published var confirmNewCareer = false
    @Published var loadError: String?
    /// The pop-up the game is showing, when it is simple enough to be a native sheet.
    @Published var dialog: [DialogNode]?
    @Published var hasAIKey: Bool
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
    /// Simple pop-ups (press, trades, injuries) as native sheets. Off: they stay web pop-ups.
    @Published var nativePopups: Bool {
        didSet { UserDefaults.standard.set(nativePopups, forKey: "nativePopups"); applyLook() }
    }

    let webView: WKWebView
    let store = PersistentStore()
    private static let pageURL = URL(string: "nbacs://app/index.html")!

    override init() {
        let defaults = UserDefaults.standard
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "nbacs")
        webView = WKWebView(frame: .zero, configuration: config)
        let saved = defaults.double(forKey: "pageZoom")
        zoom = saved == 0 ? 1.0 : saved
        toolbarTabs = defaults.object(forKey: "toolbarTabs") as? Bool ?? true
        macLook = defaults.object(forKey: "macLook") as? Bool ?? true
        nativePopups = defaults.object(forKey: "nativePopups") as? Bool ?? true
        hasAIKey = Keychain.read() != nil
        super.init()
        config.userContentController.add(self, name: "nbacs")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.pageZoom = zoom
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false          // no pinch zoom
        webView.underPageBackgroundColor = NSColor(red: 0.11, green: 0.11, blue: 0.118, alpha: 1)
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        load()
    }

    // MARK: derived state for the views

    var windowTitle: String { info.hasCareer ? info.name : "NBA Career Sim" }

    var windowSubtitle: String {
        guard info.hasCareer else { return "Create your player" }
        let age: String? = info.age > 0 ? "Age \(info.age)" : nil
        return [age, info.team, info.record].compactMap { $0 }.joined(separator: " · ")
    }

    var canSimNextGame: Bool { info.hasCareer && info.stage == "season_play" }

    func badge(for section: GameSection) -> String? { info.badge(for: section) }

    /// Tab label for the toolbar: "Career" or "Season · 2" when the game has news there.
    func tabTitle(for section: GameSection) -> String {
        guard let badge = info.badge(for: section) else { return section.shortTitle }
        return section.shortTitle + " · " + badge
    }

    // MARK: loading

    func load() {
        loadError = PageResources.indexURL() == nil
            ? "The game page (index.html) was not found. Build the app with macos/build-app.sh."
            : nil
        // the script that fills the page's storage from our file is rebuilt on every load, so it is never stale
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(StoreScript.make(items: store.items, aiKey: Keychain.read() ?? ""))
        webView.load(URLRequest(url: Self.pageURL))
    }

    // MARK: commands to the game

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

    func pressDialogButton(_ id: String) {
        guard id.allSatisfy({ $0.isNumber }) else { return }
        run("window.__NBA_UI && window.__NBA_UI.host.press('\(id)')")
    }

    func applyLook() {
        run("window.__NBA_UI && window.__NBA_UI.host.look(\(macLook), \(toolbarTabs), \(nativePopups))")
    }

    func zoomIn() { zoom += 0.1 }
    func zoomOut() { zoom -= 0.1 }
    func zoomReset() { zoom = 1.0 }

    /// Removes the save game and every setting and restarts the game. The Keychain key is removed too.
    func resetGameData() {
        let websiteStore = webView.configuration.websiteDataStore
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        store.removeAll()
        Keychain.delete()
        hasAIKey = false
        websiteStore.fetchDataRecords(ofTypes: types) { [weak self] records in
            websiteStore.removeData(ofTypes: types, for: records) {
                DispatchQueue.main.async {
                    self?.info = .empty
                    self?.section = .season
                    self?.load()
                }
            }
        }
    }

    // MARK: Claude API key (Keychain)

    func saveAIKey(_ key: String) {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        hasAIKey = Keychain.write(trimmed)
        pushAIKeyToPage(trimmed)
    }

    func removeAIKey() {
        Keychain.delete()
        hasAIKey = false
        pushAIKeyToPage("")
    }

    private func pushAIKeyToPage(_ key: String) {
        run("window.__nbacsKey && window.__nbacsKey.set(\(jsString(key))); window.__NBA_UI && window.__NBA_UI.host.keyChanged()")
    }

    // MARK: files and sharing

    func openCareer() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        panel.message = "Choose a career file saved from NBA Career Sim"
        panel.begin { [weak self] result in
            guard result == .OK, let url = panel.url else { return }
            guard let text = try? String(contentsOf: url, encoding: .utf8) else {
                self?.showAlert("Could not read that file")
                return
            }
            self?.webView.evaluateJavaScript("window.__NBA_UI.host.importSave(\(jsString(text)))") { value, _ in
                if let message = value as? String, message != "ok" { self?.showAlert(message) }
            }
        }
    }

    func saveCareerAs() {
        webView.evaluateJavaScript("window.__NBA_UI && window.__NBA_UI.host.saveText()") { [weak self] value, _ in
            guard let self = self, let text = value as? String else {
                self?.showAlert("There is no career to save yet")
                return
            }
            let panel = NSSavePanel()
            panel.allowedContentTypes = [.json]
            panel.nameFieldStringValue = "NBA Career Sim - \(self.info.name).json"
            panel.begin { result in
                guard result == .OK, let url = panel.url else { return }
                do { try text.write(to: url, atomically: true, encoding: .utf8) }
                catch { self.showAlert("Could not save the file", detail: error.localizedDescription) }
            }
        }
    }

    func sharePlayerCard() {
        webView.evaluateJavaScript("window.__NBA_UI && window.__NBA_UI.host.card()") { [weak self] value, _ in
            guard let self = self,
                  let dataURL = value as? String,
                  let comma = dataURL.firstIndex(of: ","),
                  let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
                  let image = NSImage(data: data) else {
                self?.showAlert("There is no player card yet")
                return
            }
            let picker = NSSharingServicePicker(items: [image])
            let anchor = NSRect(x: self.webView.bounds.midX, y: self.webView.bounds.maxY - 2, width: 1, height: 1)
            picker.show(relativeTo: anchor, of: self.webView, preferredEdge: .minY)
        }
    }

    func revealSaveFiles() {
        NSWorkspace.shared.activateFileViewerSelecting([store.directory])
    }

    // MARK: quitting

    /// Asks the page to send what it has not sent yet, then writes the file, then lets the app quit.
    func flushForQuit(_ done: @escaping () -> Void) {
        webView.evaluateJavaScript("window.__nbacsFlush && window.__nbacsFlush()") { [weak self] _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                self?.store.flush()
                done()
            }
        }
    }

    // MARK: helpers

    private func run(_ js: String) {
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func showAlert(_ message: String, detail: String? = nil) {
        let alert = NSAlert()
        alert.messageText = message
        if let detail = detail { alert.informativeText = detail }
        alert.runModal()
    }

    private func updateDockBadge(_ count: Int) {
        NSApp?.dockTile.badgeLabel = count > 0 ? String(count) : nil
    }

    private func haptic(_ style: String) {
        let performer = NSHapticFeedbackManager.defaultPerformer
        switch style {
        case "tap":
            performer.perform(.alignment, performanceTime: .now)
        case "level":
            performer.perform(.levelChange, performanceTime: .now)
        case "big":
            performer.perform(.levelChange, performanceTime: .now)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                performer.perform(.generic, performanceTime: .now)
            }
        default:
            break
        }
    }

    private func disableBounce(in view: NSView) {
        for child in view.subviews {
            if let scroll = child as? NSScrollView {
                scroll.verticalScrollElasticity = .none
                scroll.horizontalScrollElasticity = .none
            }
            disableBounce(in: child)
        }
    }
}

private func jsString(_ text: String) -> String {
    guard let data = try? JSONEncoder().encode(text), let json = String(data: data, encoding: .utf8) else { return "\"\"" }
    return json
}

// MARK: messages from the game

extension AppModel: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let kind = object["kind"] as? String else { return }
        DispatchQueue.main.async { self.handle(kind: kind, object: object, data: data) }
    }

    private func handle(kind: String, object: [String: Any], data: Data) {
        switch kind {
        case "state":
            guard let next = try? JSONDecoder().decode(HostInfo.self, from: data) else { return }
            info = next
            if let shown = GameSection(rawValue: next.view), shown != section { section = shown }
            updateDockBadge(next.inbox)
        case "dialog":
            struct Wrapper: Decodable { var nodes: [DialogNode]? }
            dialog = (try? JSONDecoder().decode(Wrapper.self, from: data))?.nodes
        case "store":
            guard let items = object["items"] as? [String: Any] else { return }
            for (key, value) in items {
                if let text = value as? String { store.set(key, text) } else { store.remove(key) }
            }
        case "aikey":
            let value = (object["value"] as? String) ?? ""
            if value.isEmpty { Keychain.delete() } else { Keychain.write(value) }
            hasAIKey = !value.isEmpty
        case "haptic":
            haptic((object["style"] as? String) ?? "")
        default:
            break
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
        disableBounce(in: webView)
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

    /// The game's "are you sure" buttons call confirm(label): show a real alert titled with that action.
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let action = message.trimmingCharacters(in: CharacterSet(charactersIn: " ▶→»…")).trimmingCharacters(in: .whitespaces)
        let alert = NSAlert()
        alert.messageText = action.isEmpty ? "Are you sure?" : "\(action)?"
        alert.informativeText = "This can't be undone."
        alert.alertStyle = .warning
        alert.addButton(withTitle: String(action.prefix(28)).isEmpty ? "OK" : String(action.prefix(28)))
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
        showAlert("Could not save the file", detail: error.localizedDescription)
    }
}
