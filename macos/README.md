# NBA Career Sim for macOS

A SwiftUI app around the same game as the website. The game itself (all the simulation, screens and AI features) is still `dist/index.html` running in a `WKWebView`, so the UI and the saves match the web version exactly. What is native:

- **Sidebar** (`NavigationSplitView`): Season, Team, Around the League, Career, with the player card (name, OVR, age, team, record) and the same news badges the web nav had.
- **Toolbar and menus**: Sim Next Game (⌘↩), screens on ⌘1–⌘4, New Career (⌘N), Game Settings (⇧⌘G), zoom (⌘= ⌘- ⌘0), reload (⌘R).
- **Window**: title and subtitle show your player, team and record. Dark mode only, like the game.
- **Settings** (⌘,): page zoom and "Erase all game data".
- **Files**: the player card PNG and the career export open a normal Save panel. Links open in your browser.

## Build and install (on a Mac)

Needs macOS 13 or newer and Xcode (or the Command Line Tools) with Swift 5.9+.

```
./macos/build-app.sh --install --open
```

That bundles `dist/index.html`, compiles a universal (Apple silicon + Intel) build, assembles and signs `NBA Career Sim.app`, copies it to `/Applications` (or `~/Applications` if that is not writable), and registers it:

- **Spotlight**: press ⌘Space and type "NBA Career". The script runs `mdimport` on the app so it is found right away.
- **Launchpad**: it appears with the app icon after a few seconds. If it does not, run `defaults write com.apple.dock ResetLaunchPad -bool true && killall Dock` once (this also resets your Launchpad layout).
- **Dock**: open it once, then right-click the icon, Options, Keep in Dock.

Other options:

```
./macos/build-app.sh            # just build: macos/build/NBA Career Sim.app
./macos/build-app.sh --dmg      # also make macos/build/NBA-Career-Sim.dmg (open it, drag the app onto Applications)
```

To work on it in Xcode: open the `macos/` folder (File → Open, pick `Package.swift`), then Run. For `swift run` from the `macos/` folder the app loads `../dist/index.html` (override with `NBACS_HTML=/path/to/index.html`). Note that `swift run` is not an app bundle, so it will not show up in Spotlight or Launchpad: use `--install` for that.

## How the two sides talk

- Game → app: after every screen it draws, `hostSync()` in `src/ui.js` posts one JSON message (`HostInfo.swift`) to `webkit.messageHandlers.nbacs`. It does nothing in a normal browser.
- App → game: the app calls `window.__NBA_UI.host.setView / newCareer / settings / sync`.
- The page is served from `nbacs://app/index.html` (`PageResources.swift`) so it has its own origin; that is what keeps the save in localStorage between launches. Only `index.html` is ever served.
- The web header is hidden (`html.host-mac` in `style.css`), the sidebar replaces it.

After changing the game code, run `python3 scripts/build.py` (or just `build-app.sh`) so `dist/index.html` is current.

## Notes

- Your save lives in the app's WebKit storage, not in the browser's. Use the in-game export/save slots to move a career between the website and the app.
- The AI features still use your own API key, entered in the game's settings; it is stored in the app's web storage and only sent to api.anthropic.com.
- To publish outside your own Mac you would need a Developer ID certificate and notarization, and if you turn on the App Sandbox, the "Outgoing Connections (Client)" entitlement so the AI features can reach the network.
