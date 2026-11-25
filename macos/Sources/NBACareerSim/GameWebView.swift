import SwiftUI
import WebKit

/// Puts the model's single WKWebView into the SwiftUI window.
struct GameWebView: NSViewRepresentable {
    let webView: WKWebView

    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
