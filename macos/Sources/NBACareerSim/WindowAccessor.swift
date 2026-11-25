import AppKit
import SwiftUI

/// Window details SwiftUI does not expose: it remembers its size and position, can go full screen,
/// and has the same dark colour as the page behind it.
struct WindowAccessor: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.setFrameAutosaveName("NBACareerSimMainWindow")
            window.collectionBehavior.insert(.fullScreenPrimary)
            window.backgroundColor = NSColor(red: 0.11, green: 0.11, blue: 0.118, alpha: 1)
            window.isRestorable = true
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}
